/* NEXORA app shell: router, role-based navigation, top bar, demo controls, boot sequence. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store;
  const views = NX.views = NX.views || {};

  /* ---------- Routes ---------- */
  // perm: permission required (UI-level only; the server must enforce real access control)
  const ROUTES = [
    { re: /^\/login$/, view: 'auth', mode: 'login', public: true },
    { re: /^\/register$/, view: 'auth', mode: 'register', public: true },
    { re: /^\/recover$/, view: 'auth', mode: 'recover', public: true },
    { re: /^\/staff-login$/, view: 'auth', mode: 'staff', public: true },
    { re: /^\/trade(?:\/(\w+))?$/, view: 'terminal', keys: ['market'], perm: 'terminal.trade', nav: 'trade' },
    { re: /^\/heatmap$/, view: 'heatmap', nav: 'heatmap' },
    { re: /^\/analysis$/, view: 'analysis', nav: 'analysis' },
    { re: /^\/portfolio$/, view: 'cabinet', tab: 'portfolio', perm: 'cabinet.view', nav: 'portfolio' },
    { re: /^\/wallet(?:\/(\w+))?$/, view: 'cabinet', tab: 'wallet', keys: ['sub'], perm: 'cabinet.view', nav: 'wallet' },
    { re: /^\/history(?:\/(\w+))?$/, view: 'cabinet', tab: 'history', keys: ['sub'], perm: 'cabinet.view', nav: 'history' },
    { re: /^\/notifications$/, view: 'cabinet', tab: 'notifications', perm: 'cabinet.view', nav: 'notifications' },
    { re: /^\/support$/, view: 'cabinet', tab: 'support', perm: 'cabinet.view', nav: 'support' },
    { re: /^\/profile(?:\/(\w+))?$/, view: 'cabinet', tab: 'profile', keys: ['sub'], perm: 'cabinet.view', nav: 'profile' },
    { re: /^\/crm$/, view: 'crm', tab: 'dashboard', perm: 'crm.view', nav: 'crm' },
    { re: /^\/crm\/clients$/, view: 'crm', tab: 'clients', perm: 'crm.view', nav: 'crm-clients' },
    { re: /^\/crm\/client\/([\w-]+)$/, view: 'crm', tab: 'client', keys: ['id'], perm: 'crm.view', nav: 'crm-clients' },
    { re: /^\/crm\/funnel$/, view: 'crm', tab: 'funnel', perm: 'crm.view', nav: 'crm-funnel' },
    { re: /^\/crm\/tasks$/, view: 'crm', tab: 'tasks', perm: 'crm.view', nav: 'crm-tasks' },
    { re: /^\/crm\/tickets(?:\/([\w-]+))?$/, view: 'crm', tab: 'tickets', keys: ['id'], perm: 'crm.view', nav: 'crm-tickets' },
    { re: /^\/crm\/payments$/, view: 'crm', tab: 'payments', perm: 'crm.view', nav: 'crm-payments' },
    { re: /^\/admin\/staff$/, view: 'admin', tab: 'staff', perm: 'admin.staff', nav: 'admin-staff' },
    { re: /^\/admin\/roles$/, view: 'admin', tab: 'roles', perm: 'admin.roles', nav: 'admin-roles' },
    { re: /^\/admin\/instruments$/, view: 'admin', tab: 'instruments', perm: 'admin.instruments', nav: 'admin-instruments' },
    { re: /^\/admin\/fees$/, view: 'admin', tab: 'fees', perm: 'admin.fees', nav: 'admin-fees' },
    { re: /^\/admin\/settings$/, view: 'admin', tab: 'settings', perm: 'admin.settings', nav: 'admin-settings' },
    { re: /^\/admin\/data$/, view: 'admin', tab: 'data', perm: 'admin.settings', nav: 'admin-data' }
  ];
  const home = (role) => role === 'client' ? '/trade/all' : '/crm';

  function parse() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const query = {}; new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
    for (const r of ROUTES) { const m = path.match(r.re); if (m) { const params = Object.assign({}, query); (r.keys || []).forEach((k, i) => { if (m[i + 1]) params[k] = decodeURIComponent(m[i + 1]); }); return { route: r, params, path }; } }
    return { route: null, params: query, path };
  }
  NX.go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };

  /* ---------- Navigation model ---------- */
  function navItems() {
    const s = S.state.session, items = [];
    if (!s) return items;
    if (s.role === 'client') {
      items.push({ label: 'nav.section.trading' });
      items.push({ id: 'trade', icon: 'terminal', text: 'nav.terminal', href: '/trade/all', sub: [{ id: 'trade-all', text: 'market.all', href: '/trade/all', icon: 'globe' }].concat(NX.catalog.MARKETS.map((m) => ({ id: 'trade-' + m, text: 'market.' + m, href: '/trade/' + m, icon: m }))).concat([{ id: 'trade-favorites', text: 'market.favorites', href: '/trade/favorites', icon: 'star' }]) });
      items.push({ id: 'heatmap', icon: 'heatmap', text: 'nav.heatmap', href: '/heatmap' });
      items.push({ id: 'analysis', icon: 'analysis', text: 'nav.analysis', href: '/analysis' });
      items.push({ label: 'nav.section.cabinet' });
      items.push({ id: 'portfolio', icon: 'portfolio', text: 'nav.portfolio', href: '/portfolio' });
      items.push({ id: 'wallet', icon: 'wallet', text: 'nav.wallet', href: '/wallet' });
      items.push({ id: 'history', icon: 'history', text: 'nav.history', href: '/history' });
      items.push({ id: 'notifications', icon: 'bell', text: 'nav.notifications', href: '/notifications', badge: NX.app.unread });
      items.push({ id: 'support', icon: 'support', text: 'nav.support', href: '/support' });
      items.push({ id: 'profile', icon: 'user', text: 'nav.profile', href: '/profile' });
    } else {
      items.push({ label: 'nav.section.crm' });
      items.push({ id: 'crm', icon: 'dashboard', text: 'nav.crmDashboard', href: '/crm' });
      items.push({ id: 'crm-clients', icon: 'users', text: 'nav.crmClients', href: '/crm/clients' });
      items.push({ id: 'crm-funnel', icon: 'funnel', text: 'nav.crmFunnel', href: '/crm/funnel' });
      items.push({ id: 'crm-tasks', icon: 'tasks', text: 'nav.crmTasks', href: '/crm/tasks', badge: NX.app.staffBadge });
      items.push({ id: 'crm-tickets', icon: 'ticket', text: 'nav.crmTickets', href: '/crm/tickets' });
      items.push({ id: 'crm-payments', icon: 'wallet', text: 'nav.crmPayments', href: '/crm/payments' });
      items.push({ label: 'nav.section.markets' });
      items.push({ id: 'heatmap', icon: 'heatmap', text: 'nav.heatmap', href: '/heatmap' });
      items.push({ id: 'analysis', icon: 'analysis', text: 'nav.analysis', href: '/analysis' });
      if (NX.api.can('admin.staff') || NX.api.can('admin.settings')) {
        items.push({ label: 'nav.section.admin' });
        if (NX.api.can('admin.staff')) items.push({ id: 'admin-staff', icon: 'briefcase', text: 'nav.adminStaff', href: '/admin/staff' });
        if (NX.api.can('admin.roles')) items.push({ id: 'admin-roles', icon: 'key', text: 'nav.adminRoles', href: '/admin/roles' });
        if (NX.api.can('admin.instruments')) items.push({ id: 'admin-instruments', icon: 'list', text: 'nav.adminInstruments', href: '/admin/instruments' });
        if (NX.api.can('admin.fees')) items.push({ id: 'admin-fees', icon: 'percent', text: 'nav.adminFees', href: '/admin/fees' });
        if (NX.api.can('admin.settings')) items.push({ id: 'admin-data', icon: 'analysis', text: 'nav.adminData', href: '/admin/data' });
        if (NX.api.can('admin.settings')) items.push({ id: 'admin-settings', icon: 'settings', text: 'nav.adminSettings', href: '/admin/settings' });
      }
    }
    return items;
  }

  /* ---------- Shell ---------- */
  let shellEl = null, current = null, currentKey = '';
  function renderShell() {
    const root = document.getElementById('root');
    root.innerHTML =
      '<div class="demo-strip" role="note"><span>' + U.icon('info', '').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"') + ' <b>' + t('demo.strip') + '</b> <span class="txt">' + t('demo.stripText') + '</span></span>' +
      '<span id="liveState"></span><button data-act="live" id="liveBtn"></button><span id="clockState"></span><button data-act="clock" id="clockBtn"></button><button data-act="resetDemo">' + t('demo.reset') + '</button></div>' +
      '<div class="app"><aside class="sidebar" id="sidebar" aria-label="' + t('nav.main') + '"></aside><div class="main">' +
      '<header class="topbar"><button class="icon-btn mobile-toggle" data-act="menu" aria-label="' + t('nav.open') + '" aria-controls="sidebar" aria-expanded="false">' + U.icon('menu') + '</button>' +
      '<div class="crumb" id="crumb"></div><div class="top-actions">' +
      '<div class="gsearch rel"><label class="sr-only" for="gsearch">' + t('search.global') + '</label>' + U.icon('search') + '<input id="gsearch" type="search" autocomplete="off" placeholder="' + t('search.global') + '"><div class="gsearch-results" id="gresults" hidden></div></div>' +
      '<div class="role-switch" role="group" aria-label="' + t('role.switch') + '">' + ['client', 'manager', 'admin'].map((r) => '<button data-act="role" data-role="' + r + '" class="' + (S.state.session && S.state.session.role === r ? 'active' : '') + '" aria-pressed="' + (S.state.session && S.state.session.role === r) + '">' + t('role.' + r) + '</button>').join('') + '</div>' +
      '<select class="select-sm" id="langSel" aria-label="' + t('lang.label') + '">' + NX.i18n.langs.map((l) => '<option value="' + l + '"' + (NX.i18n.lang === l ? ' selected' : '') + ' title="' + t('lang.' + l) + '">' + l.toUpperCase() + '</option>').join('') + '</select>' +
      '<button class="icon-btn" data-act="bell" id="bellBtn" aria-label="' + t('nav.notifications') + '">' + U.icon('bell') + '<span class="dot-count" id="bellCount" hidden></span></button>' +
      '<div class="rel"><button class="account-chip" data-act="account" aria-haspopup="menu" aria-expanded="false" id="accBtn"></button></div>' +
      '</div></header><main class="workspace" id="view" tabindex="-1"></main><div class="footer">NEXORA TRADING © 2026 · ' + t('demo.footer') + '<div id="attribution" style="margin-top:4px"></div></div></div></div>';
    shellEl = root;
    renderSidebar(); renderAccountChip(); renderClock(); updateBadges();
    renderLive();
    ui.delegate(root.querySelector('.demo-strip'), { clock: toggleClock, resetDemo, live: () => { NX.live.setEnabled(!NX.live.enabled()); ui.toast(t(NX.live.enabled() ? 'live.turnedOn' : 'live.turnedOff'), 'info'); renderLive(); } });
    ui.delegate(root.querySelector('.topbar'), {
      menu: () => toggleMenu(),
      role: (el) => switchRole(el.dataset.role),
      bell: () => NX.go(S.state.session.role === 'client' ? '/notifications' : '/crm/tasks'),
      account: (el) => accountMenu(el)
    });
    root.querySelector('#langSel').addEventListener('change', (e) => setLang(e.target.value));
    initSearch(root.querySelector('#gsearch'), root.querySelector('#gresults'));
  }
  function renderSidebar() {
    const sb = document.getElementById('sidebar'); if (!sb) return;
    const active = (current && current.route && current.route.nav) || '', market = current && current.params && current.params.market;
    const html = navItems().map((it) => {
      if (it.label) return '<div class="nav-label">' + t(it.label) + '</div>';
      const isActive = active === it.id && !(it.sub && market);
      let h = '<a class="nav-btn ' + (isActive || (it.sub && active === it.id) ? 'active' : '') + '" href="#' + it.href + '"' + (isActive ? ' aria-current="page"' : '') + '>' + U.icon(it.icon) + '<span>' + t(it.text) + '</span>' + (it.badge ? '<span class="badge" data-badge="' + it.id + '"' + (it.badge() ? '' : ' hidden') + '>' + it.badge() + '</span>' : '') + '</a>';
      if (it.sub && active === it.id) h += '<div class="nav-sub">' + it.sub.map((s) => '<a class="nav-btn ' + (market === s.id.replace('trade-', '') ? 'active' : '') + '" href="#' + s.href + '">' + U.icon(s.icon) + '<span>' + t(s.text) + '</span></a>').join('') + '</div>';
      return h;
    }).join('');
    sb.innerHTML = '<div class="brand">' + ui.logo() + '<div class="nx-wordmark shine">NEXORA<small>' + (S.state.session && S.state.session.role !== 'client' ? 'CRM · ADMIN' : 'TRADING') + '</small></div></div><nav class="nav-list">' + html + '</nav>' +
      '<div class="nav-bottom"><div class="side-promo"><span class="k">' + t('demo.badge') + '</span><p>' + t('demo.sidebar') + '</p></div><div class="side-foot">© 2026 NEXORA</div></div>';
    sb.onclick = (e) => { if (e.target.closest('a')) toggleMenu(false); };
  }
  function toggleMenu(force) {
    const sb = document.getElementById('sidebar'), btn = document.querySelector('[data-act=menu]');
    const open = force != null ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', open); if (btn) btn.setAttribute('aria-expanded', String(open));
    let scrim = document.getElementById('scrim');
    if (open && !scrim) { scrim = document.createElement('div'); scrim.id = 'scrim'; scrim.className = 'scrim'; scrim.onclick = () => toggleMenu(false); document.body.appendChild(scrim); }
    if (!open && scrim) scrim.remove();
    if (open) { const f = sb.querySelector('a'); if (f) f.focus(); }
  }
  function renderAccountChip() {
    const b = document.getElementById('accBtn'); if (!b) return;
    const s = S.state.session; const who = NX.app.who || { name: '—', sub: '' };
    b.innerHTML = '<span class="avatar">' + U.esc(U.initials(who.name)) + '</span><span class="who"><b>' + U.esc(who.name) + '</b><small>' + U.esc(who.sub) + '</small></span>';
    b.setAttribute('aria-label', t('account.menu') + ': ' + who.name + (s ? ' (' + t('role.' + s.role) + ')' : ''));
  }
  function accountMenu(btn) {
    const host = btn.parentElement; const old = host.querySelector('.menu'); if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    const s = S.state.session;
    const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<div class="mh"><b>' + U.esc((NX.app.who || {}).name || '') + '</b><div class="muted" style="font-size:11px;margin-top:3px">' + t('role.' + s.role) + ' · ' + t('demo.badge') + '</div></div>' +
      (s.role === 'client' ? '<a role="menuitem" href="#/profile">' + U.icon('user') + t('nav.profile') + '</a><a role="menuitem" href="#/wallet">' + U.icon('wallet') + t('nav.wallet') + '</a>' : '<a role="menuitem" href="#/crm">' + U.icon('dashboard') + t('nav.crmDashboard') + '</a>') +
      '<div class="mh" style="padding:8px 14px;font-size:10px;color:#7e91ab;text-transform:uppercase;letter-spacing:.06em">' + t('role.switch') + '</div>' +
      ['client', 'manager', 'admin'].map((r) => '<button role="menuitemradio" aria-checked="' + (s.role === r) + '" data-m="role" data-role="' + r + '">' + U.icon(r === 'client' ? 'user' : r === 'manager' ? 'users' : 'key') + t('role.' + r) + (s.role === r ? ' ✓' : '') + '</button>').join('') +
      '<button role="menuitem" data-m="reset">' + U.icon('reset') + t('demo.reset') + '</button><button role="menuitem" data-m="logout">' + U.icon('logout') + t('auth.logout') + '</button>';
    host.appendChild(m); btn.setAttribute('aria-expanded', 'true');
    const close = (e) => { if (!e || !host.contains(e.target)) { m.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
    m.addEventListener('click', (e) => { const a = e.target.closest('[data-m],a'); if (!a) return; close(); if (a.dataset.m === 'logout') logout(); if (a.dataset.m === 'reset') resetDemo(); if (a.dataset.m === 'role') switchRole(a.dataset.role); });
    m.querySelector('a,button').focus();
  }

  /* ---------- Global search (instruments + clients for staff) ---------- */
  function initSearch(input, box) {
    let items = [], kb = -1;
    const close = () => { box.hidden = true; kb = -1; };
    const run = U.debounce(async () => {
      const q = input.value.trim().toLowerCase(); if (!q) { close(); return; }
      const inst = NX.catalog.all().filter((i) => (i.symbol + ' ' + i.name).toLowerCase().indexOf(q) >= 0).slice(0, 8)
        .map((i) => ({ html: ui.badge(i.id, 'xs') + '<span><b>' + U.esc(i.symbol) + '</b> <span class="muted">' + U.esc(i.name) + '</span></span>', go: S.state.session.role === 'client' ? '/trade/all?s=' + encodeURIComponent(i.id) : '/analysis?s=' + encodeURIComponent(i.id) }));
      let cl = [];
      if (NX.api.can('crm.view')) { try { const all = await NX.api.crm.clientsBrief(); cl = all.filter((c) => (c.name + ' ' + c.email + ' ' + c.id).toLowerCase().indexOf(q) >= 0).slice(0, 6).map((c) => ({ html: '<span class="avatar sm">' + U.esc(U.initials(c.name)) + '</span><span><b>' + U.esc(c.name) + '</b> <span class="muted">' + U.esc(c.id) + '</span></span>', go: '/crm/client/' + c.id })); } catch (e) { /* ignore */ } }
      items = cl.concat(inst);
      box.innerHTML = items.length ? items.map((it, i) => '<button type="button" data-i="' + i + '">' + it.html + '</button>').join('') : '<div class="state" style="padding:16px">' + t('search.none') + '</div>';
      box.hidden = false; kb = -1;
    }, 150);
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      const btns = U.$$('button', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); kb = U.clamp(kb + (e.key === 'ArrowDown' ? 1 : -1), 0, btns.length - 1); btns.forEach((b, i) => b.classList.toggle('kb', i === kb)); }
      if (e.key === 'Enter' && items.length) { const it = items[Math.max(0, kb)]; NX.go(it.go); input.value = ''; close(); }
      if (e.key === 'Escape') close();
    });
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; NX.go(items[+b.dataset.i].go); input.value = ''; close(); });
    document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) close(); });
  }

  /* ---------- Demo controls ---------- */
  function renderClock() {
    const st = document.getElementById('clockState'), b = document.getElementById('clockBtn'); if (!st) return;
    const p = NX.market.isPaused();
    st.innerHTML = p ? t('demo.paused') : '<span class="dot live" style="color:#18d27c"></span> ' + t('demo.live');
    b.textContent = p ? t('demo.resume') : t('demo.pause');
  }
  // Live price status in the demo strip + data attribution in the footer.
  function renderLive() {
    const el = document.getElementById('liveState'), b = document.getElementById('liveBtn'), at = document.getElementById('attribution');
    if (!el || !NX.live) return;
    const n = NX.catalog.all().filter((i) => NX.market.isLive(i.id)).length;
    const avail = NX.live.mode !== 'off';
    el.innerHTML = NX.live.enabled() && n ? '<span class="dot live" style="color:#18d27c"></span> ' + t('live.strip', { n, src: U.esc(NX.live.attribution()) }) : t('live.stripSim');
    b.hidden = !avail; b.textContent = t(NX.store.state.liveData !== false ? 'live.off' : 'live.on');
    if (at) at.textContent = n ? t('live.attribution', { src: NX.live.attribution() }) : '';
  }
  async function toggleClock() { await NX.api.admin.setClock(NX.market.isPaused() ? 'resume' : 'pause'); renderClock(); }
  async function resetDemo() {
    const ok = await ui.confirm(t('demo.resetTitle'), t('demo.resetText'), t('demo.reset'), true);
    if (!ok) return;
    await NX.api.admin.resetDemo();
    S.resetUi();
    ui.toast(t('demo.resetDone'), 'info');
    const s = S.state.session;
    if (s && s.role === 'client') { const r = await NX.api.auth.login('alex.morgan@example.com'); S.set('session', r); }
    await loadWho(); renderShell(); render(true);
  }
  async function switchRole(role) {
    const s = S.state.session;
    if (s && s.role === role) return;
    if (role === 'client') {
      const r = await NX.api.auth.login(NX.app.lastClientEmail || 'alex.morgan@example.com');
      S.set('session', { role: 'client', clientId: r.clientId });
    } else {
      const r = await NX.api.auth.staffSession(role);
      S.set('session', { role, staffId: r.staffId });
    }
    ui.toast(t('role.switched', { role: t('role.' + role) }), 'info');
    await loadWho(); renderShell(); NX.go(home(role));
  }
  function logout() { S.set('session', null); NX.app.who = null; NX.go(NX.app.entry === 'crm' ? '/staff-login' : '/login'); }
  function setLang(l) { NX.i18n.set(l); S.set('lang', l); if (S.state.session) renderShell(); render(true); }

  async function loadWho() {
    const s = S.state.session; if (!s) { NX.app.who = null; return; }
    try {
      if (s.role === 'client') { const me = await NX.api.me.get(); NX.app.who = { name: me.name, sub: me.id }; NX.app.lastClientEmail = me.email; }
      else { const staff = await NX.api.admin.staff(); const me = staff.find((x) => x.id === s.staffId); NX.app.who = { name: me ? me.name : t('role.' + s.role), sub: t('role.' + s.role) }; }
    } catch (e) { NX.app.who = { name: t('role.' + s.role), sub: '' }; }
  }
  function updateBadges() {
    const s = S.state.session; if (!s) return;
    const n = s.role === 'client' ? NX.app.unread() : NX.app.staffBadge();
    const bc = document.getElementById('bellCount'); if (bc) { bc.hidden = !n; bc.textContent = n > 99 ? '99+' : n; }
    U.$$('[data-badge]').forEach((el) => { const v = el.dataset.badge === 'notifications' ? NX.app.unread() : NX.app.staffBadge(); el.hidden = !v; el.textContent = v; });
  }

  /* ---------- Router ---------- */
  async function render(force) {
    const r = parse(), s = S.state.session;
    if (!r.route) { NX.go(s ? home(s.role) : (NX.app.entry === 'crm' ? '/staff-login' : '/login')); return; }
    if (!r.route.public && !s) { NX.go(NX.app.entry === 'crm' ? '/staff-login' : '/login'); return; }
    if (r.route.public && s) { NX.go(home(s.role)); return; }
    if (r.route.perm && !NX.api.can(r.route.perm)) {
      // Not available for this role (UI hint only).
      if (current && current.view && current.view.unmount) current.view.unmount();
      current = { route: r.route, params: r.params, view: null };
      if (!shellEl || !document.getElementById('view')) renderShell();
      renderSidebar();
      document.getElementById('crumb').textContent = t('access.denied');
      document.getElementById('view').innerHTML = '<div class="panel">' + ui.empty(t('access.denied'), t('access.deniedText', { role: t('role.' + s.role) }), 'lock') + '<div style="text-align:center;padding-bottom:20px"><a class="btn primary" href="#' + home(s.role) + '">' + t('access.home') + '</a></div></div>';
      return;
    }
    const key = r.route.view + '|' + (r.route.tab || '') + '|' + JSON.stringify(r.params);
    const V = views[r.route.view];
    if (r.route.public) {
      if (current && current.view && current.view.unmount) current.view.unmount();
      shellEl = null;
      current = { route: r.route, params: r.params, view: V };
      document.getElementById('root').innerHTML = '';
      V.mount(document.getElementById('root'), Object.assign({ mode: r.route.mode }, r.params));
      return;
    }
    if (!shellEl || !document.getElementById('view')) { await loadWho(); renderShell(); }
    // Same view, only params changed → let the view update in place if it supports it.
    if (!force && current && current.view === V && current.route.tab === r.route.tab && V.update && V.update(r.params, r.route)) { current.params = r.params; current.route = r.route; currentKey = key; renderSidebar(); setCrumb(V, r); return; }
    if (current && current.view && current.view.unmount) current.view.unmount();
    current = { route: r.route, params: r.params, view: V }; currentKey = key;
    renderSidebar();
    // Each view gets a fresh container, so listeners attached by a view die with it.
    const host = document.getElementById('view');
    host.innerHTML = '';
    const box = document.createElement('div');
    host.appendChild(box);
    V.mount(box, Object.assign({ tab: r.route.tab }, r.params), r.route);
    setCrumb(V, r);
    window.scrollTo(0, 0);
  }
  function setCrumb(V, r) {
    const c = document.getElementById('crumb'); if (!c) return;
    const title = V.title ? V.title(Object.assign({ tab: r.route.tab }, r.params)) : '';
    c.innerHTML = U.esc(title) + '<small>' + t('demo.badge') + '</small>';
    document.title = title + ' · NEXORA';
  }

  /* ---------- Boot ---------- */
  NX.app = {
    entry: window.NX_ENTRY || 'platform',
    who: null, lastClientEmail: null,
    unreadCache: 0, staffCache: 0,
    unread: () => NX.app.unreadCache,
    staffBadge: () => NX.app.staffCache,
    setCrumbTitle: (txt) => { const c = document.getElementById('crumb'); if (c) c.innerHTML = U.esc(txt) + '<small>' + t('demo.badge') + '</small>'; },
    refreshShell: () => { renderSidebar(); renderAccountChip(); updateBadges(); },
    reloadWho: async () => { await loadWho(); renderAccountChip(); },
    home, logout
  };
  async function refreshBadgeData() {
    const s = S.state.session; if (!s) return;
    try {
      if (s.role === 'client') { const list = await NX.api.notifications.list(); NX.app.unreadCache = list.filter((n) => !n.read).length; }
      else { const tasks = await NX.api.crm.tasks({ status: 'open' }); const now = NX.market.now(); NX.app.staffCache = tasks.filter((x) => x.dueAt < now + 86400000 - (now % 86400000)).length; }
    } catch (e) { /* badge is best-effort */ }
    updateBadges();
  }

  function boot() {
    const lang = S.state.lang || NX.i18n.detect();
    NX.i18n.set(lang);
    const logo = U.assetUrl(NX.LOGO); // absolute URL: CSS resolves relative urls against css/
    document.documentElement.style.setProperty('--nx-logo-mask', 'url("' + (logo.indexOf('data:') === 0 ? logo : new URL(logo, location.href).href) + '")');
    let fresh = false;
    try { fresh = NX.server.load(); } catch (e) { console.error(e); }
    if (!NX.storage.available) setTimeout(() => ui.toast(t('demo.noStorage'), 'warn', 8000), 800);
    // A stored session might reference a client removed by a reset.
    const s = S.state.session;
    if (s && s.role === 'client') { try { NX.server.account(NX.server.me().accountId); } catch (e) { S.set('session', null); } }
    // The CRM entry page opens on the staff login when this tab has no staff session yet.
    if (NX.app.entry === 'crm' && S.state.session && S.state.session.role === 'client' && !location.hash) S.set('session', null);
    NX.market.start();
    if (NX.live) NX.live.init(); // optional live prices (CoinGecko / Twelve Data)
    NX.bus.on('db:change', U.debounce((p) => {
      refreshBadgeData();
      if (p && p.remote && current && current.view && current.view.onRemote) current.view.onRemote();
      if (p && p.cols && (p.cols.indexOf('clients') >= 0 || p.cols.indexOf('*') >= 0)) NX.app.reloadWho();
    }, 120));
    NX.bus.on('market:clock', renderClock);
    NX.bus.on('live:update', U.debounce(renderLive, 200));
    NX.bus.on('live:status', U.debounce(renderLive, 200));
    // Task reminders are checked by every staff tab (shown once per tab, within 15 min of the reminder time).
    const shown = new Set((() => { try { return JSON.parse(sessionStorage.getItem('nexora.reminded') || '[]'); } catch (e) { return []; } })());
    let checking = false;
    NX.api.market.subscribe(async () => {
      const s2 = S.state.session; if (!s2 || s2.role === 'client' || checking) return;
      checking = true;
      try {
        const now = NX.market.now();
        const list = await NX.api.crm.tasks({ status: 'open', assigneeId: s2.role === 'manager' ? s2.staffId : 'all' });
        list.filter((x) => x.remindAt && x.remindAt <= now && now - x.remindAt < 15 * 60000 && !shown.has(x.id + ':' + x.remindAt)).forEach((x) => {
          shown.add(x.id + ':' + x.remindAt);
          ui.toast('<b>' + t('crm.reminder') + '</b><br>' + U.esc(ui.txt(x.title)) + (x.clientName ? ' · ' + U.esc(x.clientName) : '') + '<br><a href="#/crm/tasks">' + t('nav.crmTasks') + ' →</a>', 'warn', 10000);
        });
        try { sessionStorage.setItem('nexora.reminded', JSON.stringify(Array.from(shown))); } catch (e) { /* ignore */ }
      } catch (e) { /* best effort */ } finally { checking = false; }
    });
    window.addEventListener('hashchange', () => render());
    render().then(() => { refreshBadgeData(); const sp = document.getElementById('splash'); if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 400); } });
    if (fresh) console.info('[NEXORA] demo database created');
  }
  document.addEventListener('DOMContentLoaded', boot);
})(window.NX);
