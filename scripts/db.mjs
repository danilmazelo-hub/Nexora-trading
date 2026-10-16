// Local PostgreSQL without Docker (see docs/decisions/0002-local-postgres.md).
//   node scripts/db.mjs start   — init (first run) + start in the background, create nexora and nexora_test
//   node scripts/db.mjs stop    — graceful stop (data is kept in .data/postgres)
//   node scripts/db.mjs status  — is the server accepting connections?
// Same port/user/databases as docker-compose.yml, so DATABASE_URL does not change.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

// PostgreSQL on Windows cannot handle non-ASCII paths (e.g. a Cyrillic user name): use the 8.3 short form.
const NON_ASCII = /[^ -~]/;
function ascii(p) {
  if (process.platform !== 'win32' || !NON_ASCII.test(p)) return p;
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `for %I in ("${p}") do @echo %~sI`], { encoding: 'utf8', windowsVerbatimArguments: true });
  const out = (r.stdout || '').trim();
  if (!out || NON_ASCII.test(out)) throw new Error(`Cannot get an ASCII short path for ${p}; move the project to an ASCII path or use docker compose.`);
  return out;
}

const ROOT = ascii(resolve(import.meta.dirname, '..'));
const DATA = join(ROOT, '.data', 'postgres');
const LOG = join(ROOT, '.data', 'postgres.log');
const PORT = Number(process.env.NEXORA_DB_PORT ?? 5433);
const USER = 'nexora';
const PASSWORD = 'nexora'; // local-only test password (also in apps/api/.env.example)
const DATABASES = ['nexora', 'nexora_test'];

function binDir() {
  const require = createRequire(join(ROOT, 'package.json'));
  const pkg = { win32: '@embedded-postgres/windows-x64', linux: '@embedded-postgres/linux-x64', darwin: process.arch === 'arm64' ? '@embedded-postgres/darwin-arm64' : '@embedded-postgres/darwin-x64' }[process.platform];
  // embedded-postgres does not export package.json; locate its root from the main entry instead.
  let embedded = dirname(require.resolve('embedded-postgres'));
  while (!existsSync(join(embedded, 'package.json'))) embedded = dirname(embedded);
  // The platform binaries are a dependency of embedded-postgres (pnpm keeps them next to it).
  const candidates = [join(embedded, '..', pkg), join(embedded, 'node_modules', pkg)];
  const found = candidates.find((c) => existsSync(join(c, 'native', 'bin')));
  if (!found) throw new Error(`PostgreSQL binaries (${pkg}) not found; run pnpm install`);
  return ascii(join(found, 'native', 'bin'));
}
const exe = (name) => join(binDir(), process.platform === 'win32' ? name + '.exe' : name);

function portOpen() {
  return new Promise((ok) => {
    const s = net.connect({ host: '127.0.0.1', port: PORT });
    s.once('connect', () => { s.destroy(); ok(true); });
    s.once('error', () => ok(false));
  });
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

async function query(sql, database = 'postgres') {
  const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASSWORD, database, connectionTimeoutMillis: 2000 });
  await c.connect();
  try {
    return (await c.query(sql)).rows;
  } finally {
    await c.end();
  }
}

async function waitReady(ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await query('SELECT 1');
      return true;
    } catch {
      await new Promise((s) => setTimeout(s, 300));
    }
  }
  return false;
}

async function start() {
  if (await portOpen()) {
    if (!(await waitReady(5000))) throw new Error(`Port ${PORT} is busy but PostgreSQL (user ${USER}) does not answer`);
    console.info(`PostgreSQL already running on localhost:${PORT}`);
    await ensureDatabases();
    return;
  }
  mkdirSync(dirname(DATA), { recursive: true });
  if (!existsSync(join(DATA, 'PG_VERSION'))) {
    console.info('Initialising cluster in .data/postgres …');
    const pwfile = join(ROOT, '.data', 'pwfile');
    writeFileSync(pwfile, PASSWORD + '\n');
    run(exe('initdb'), ['-D', DATA, '-U', USER, '--pwfile', pwfile, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C']);
  }
  // Run the server fully detached (output to the log file) so it outlives this script and the terminal.
  const log = openSync(LOG, 'a');
  const args = ['-D', DATA, '-p', String(PORT), '-c', 'listen_addresses=127.0.0.1', '-c', 'TimeZone=UTC', '-c', 'max_logical_replication_workers=0'];
  const child = spawn(exe('postgres'), args, { stdio: ['ignore', log, log], detached: true, windowsHide: true });
  child.unref();
  if (!(await waitReady())) throw new Error('PostgreSQL did not become ready; see .data/postgres.log');
  await ensureDatabases();
  console.info(`PostgreSQL ready on localhost:${PORT} (databases: ${DATABASES.join(', ')}); data in .data/postgres`);
}

async function ensureDatabases() {
  const existing = (await query('SELECT datname FROM pg_database')).map((r) => r.datname);
  for (const db of DATABASES) {
    if (!existing.includes(db)) {
      await query(`CREATE DATABASE ${db}`);
      console.info(`created database ${db}`);
    }
  }
}

async function stop() {
  if (!existsSync(join(DATA, 'postmaster.pid'))) {
    console.info('PostgreSQL (embedded) is not running');
    return;
  }
  run(exe('pg_ctl'), ['stop', '-D', DATA, '-m', 'fast', '-w']);
  console.info('PostgreSQL stopped (data kept in .data/postgres)');
}

async function status() {
  const ready = (await portOpen()) && (await waitReady(1500));
  console.info(`localhost:${PORT} ${ready ? 'accepting connections' : 'not running'}`);
  if (existsSync(LOG) && !ready) console.info('last log lines:\n' + readFileSync(LOG, 'utf8').split(/\r?\n/).slice(-5).join('\n'));
  process.exitCode = ready ? 0 : 1;
}

const cmd = process.argv[2];
const actions = { start, stop, status };
if (!actions[cmd]) {
  console.error('usage: node scripts/db.mjs start|stop|status');
  process.exit(2);
}
actions[cmd]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
