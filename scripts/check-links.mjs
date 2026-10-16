// Checks relative Markdown links in project rules/docs (excluding the archived handoff package and legacy demo).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skip = new Set(['node_modules', '.git', '.data', 'legacy', 'handoff', 'dist', 'test-results']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.md')) files.push(p);
  }
})(root);

let broken = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = resolve(dirname(file), decodeURI(href.split('#')[0]));
    if (!existsSync(target)) {
      broken++;
      console.error(`BROKEN ${relative(root, file)} → ${href}`);
    }
  }
}
console.info(`checked ${files.length} markdown files, ${broken} broken link(s)`);
process.exit(broken ? 1 : 0);
