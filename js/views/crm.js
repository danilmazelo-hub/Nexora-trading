/* NEXORA CRM: dashboard, clients & leads, client card, funnel, tasks & reminders, support tickets,
   withdrawal review. Shares client IDs and data with the trading cabinet via NX.api. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store;
  const STAGES = ['new', 'contacted', 'qualified', 'registered', 'funded', 'active', 'lost'];
  const DAY = 86400000;
  let st = null, root = null, offs = [];

  const head = (title, desc, actions) => '<div class="heading"><div><h1>' + title + '</h1><p>' + desc + '</p></div><div class="actions">' + (actions || '') + '</div></div>';
  const td = (label, v, cls) => '<td data-label="' + U.esc(label) + '" class="' + (cls || '') + '">' + v + '</td>';
  const stat = (lbl, val, sub, cls, href) => '<' + (href ? 'a href="#' + href + '" style="color:inherit"' : 'div') + ' class="panel stat"><div class="lbl">' + lbl + '</div><div class="val ' + (cls || '') + '">' + val + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</' + (href ? 'a' : 'div') + '>';
  const myId = () => (S.state.session || {}).staffId;
  const staffOpts = (sel, withNone) => (withNone ? '<option value="">' + t('crm.unassigned') + '</option>' : '') + (st.staff || []).filter((s) => s.active && s.role !== 'client').map((s) => '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + U.esc(s.name) + ' · ' + t('role.' + s.role) + '</option>').join('');
  const stageOpts = (sel) => STAGES.map((s) => '<option value="' + s + '"' + (s === sel ? ' selected' : '') + '>' + t('stage.' + s) + '</option>').join('');
  async function ensureStaff() { if (!st.staff) st.staff = await NX.api.admin.staff(); return st.staff; }

  /* ======================= Dashboard ======================= */
  async function dashboard(el) {
    el.innerHTML = head(t('nav.crmDashboard'), t('crm.dashDesc'), '<button class="btn primary" data-act="newclient">' + U.icon('plus') + t('crm.newClient') + '</button>') + '<div id="dBody">' + ui.loading(8) + '</div>';
    try {
      await ensureStaff();
      const [d, tasks] = await Promise.all([NX.api.crm.dashboard(), NX.api.crm.tasks({ status: 'open', assigneeId: S.state.session.role === 'manager' ? myId() : 'all' })]);
      const now = NX.market.now();
      const due = tasks.filter((x) => x.dueAt < now + DAY).slice(0, 7);
      const dfmt = (ts) => new Intl.DateTimeFormat(NX.i18n.lang, { day: '2-digit', month: '2-digit' }).format(new Date(ts));
      const maxStage = Math.max(1, ...STAGES.map((s) => d.stages[s] || 0));
      U.$('#dBody', el).innerHTML = '<div class="grid c4" style="margin-bottom:14px">' +
        stat(t('crm.totalClients'), U.fmt(d.totalClients, 0), t('crm.leadsN', { n: d.leads }), '', '/crm/clients') +
        stat(t('crm.conversion'), U.fmt(d.conversion, 1) + '%', t('crm.fundedN', { n: d.funded })) +
        stat(t('crm.aum'), U.usd(d.aum, 0), t('crm.deposits30') + ' ' + U.usd(d.deposits30, 0)) +
        stat(t('crm.activity'), U.fmt(d.trades24, 0), t('crm.volume30') + ' ' + U.usd(d.volume30, 0)) + '</div>' +
        '<div class="grid c4" style="margin-bottom:14px">' +
        stat(t('crm.openTickets'), d.openTickets, '', d.openTickets ? 'cyan' : '', '/crm/tickets') +
        stat(t('crm.overdueTasks'), d.overdueTasks, t('crm.todayTasks', { n: d.todayTasks }), d.overdueTasks ? 'down' : '', '/crm/tasks') +
        stat(t('crm.pendingWd'), d.pendingWithdrawals, t('crm.pendingWdSub'), d.pendingWithdrawals ? 'cyan' : '', '/crm/payments') +
        stat(t('crm.activeTraders'), d.active, t('stage.active')) + '</div>' +
        '<div class="grid c2" style="margin-bottom:14px"><section class="panel"><div class="panel-title"><h3>' + t('crm.regs14') + '</h3><small>' + t('crm.byDay') + '</small></div>' + ui.bars(d.regs.map((r) => ({ v: r.n, label: U.date(r.t), short: dfmt(r.t) }))) + '</section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('crm.deps14') + '</h3><small>USD</small></div>' + ui.bars(d.deps.map((r) => ({ v: r.usd, label: U.date(r.t), short: dfmt(r.t) })), (v) => U.usd(v, 0), 'linear-gradient(0deg,#0c8f5c,#18d27c)') + '</section></div>' +
        '<div class="grid c3"><section class="panel"><div class="panel-title"><h3>' + t('nav.crmFunnel') + '</h3><a class="btn sm" href="#/crm/funnel">' + t('crm.open') + '</a></div><div class="panel-body">' +
        STAGES.map((s) => '<div style="margin:6px 0"><div class="kv" style="padding:2px 0"><span>' + t('stage.' + s) + '</span><b>' + (d.stages[s] || 0) + '</b></div><div class="meter" style="margin:3px 0"><span style="width:' + ((d.stages[s] || 0) / maxStage * 100) + '%;background:' + (s === 'lost' ? '#ff5c6c' : 'linear-gradient(90deg,#1377db,#19c2ff)') + '"></span></div></div>').join('') + '</div></section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('crm.myTasks') + '</h3><a class="btn sm" href="#/crm/tasks">' + t('crm.open') + '</a></div>' + (due.length ? due.map(taskRow).join('') : ui.empty(t('crm.noDue'), '', 'tasks')) + '</section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('crm.managers') + '</h3></div><div class="table-wrap"><table class="dt"><thead><tr><th>' + t('col.manager') + '</th><th class="r">' + t('crm.clientsShort') + '</th><th class="r">' + t('crm.fundedShort') + '</th></tr></thead><tbody>' +
        d.managers.map((m) => '<tr><td><div class="asset"><span class="avatar sm">' + U.esc(U.initials(m.name)) + '</span>' + U.esc(m.name) + '</div></td><td class="r">' + m.clients + '</td><td class="r">' + m.funded + '</td></tr>').join('') + '</tbody></table></div></section></div>';
    } catch (e) { U.$('#dBody', el).innerHTML = ui.error(e, 'reload'); }
  }
  function taskRow(x) {
    const now = NX.market.now(), overdue = x.status === 'open' && x.dueAt < now;
    return '<div class="task ' + (x.status === 'done' ? 'done' : '') + '"><input type="checkbox" class="check" style="accent-color:#19c2ff;width:17px;height:17px" data-act="taskdone" data-id="' + x.id + '"' + (x.status === 'done' ? ' checked' : '') + ' aria-label="' + t('crm.markDone') + '"><div style="min-width:0"><b>' + U.esc(ui.txt(x.title)) + '</b><small>' + t('ttype.' + x.type) + ' · ' + (x.clientId ? '<a href="#/crm/client/' + x.clientId + '">' + U.esc(x.clientName || x.clientId) + '</a> · ' : '') + '<span class="' + (overdue ? 'overdue' : '') + '">' + (overdue ? t('crm.overdue') + ' · ' : '') + U.dateTime(x.dueAt) + '</span>' + (x.remindAt && x.status === 'open' ? ' · ⏰ ' + U.time(x.remindAt) : '') + '</small></div>' +
      '<span>' + ui.status('prio', x.priority) + (x.status === 'open' ? ' <button class="btn sm" data-act="snooze" data-id="' + x.id + '" title="' + t('crm.snooze') + '">+1h</button>' : '') + '</span></div>';
  }

  /* ======================= Clients table ======================= */
  async function clients(el) {
    await ensureStaff();
    st.q = st.q || { search: '', stage: 'all', managerId: S.state.session.role === 'manager' ? 'all' : 'all', kyc: 'all', sort: 'createdAt', dir: 'desc', page: 1, pageSize: S.state.crm.pageSize || 10 };
    const q = st.q;
    el.innerHTML = head(t('nav.crmClients'), t('crm.clientsDesc'), '<button class="btn primary" data-act="newclient">' + U.icon('plus') + t('crm.newClient') + '</button>') +
      '<section class="panel"><div class="toolbar"><input class="input" id="cSearch" type="search" placeholder="' + t('crm.searchPh') + '" value="' + U.esc(q.search) + '" aria-label="' + t('crm.searchPh') + '">' +
      '<select class="input" id="cStage" aria-label="' + t('col.stage') + '"><option value="all">' + t('crm.allStages') + '</option><option value="leads">' + t('crm.onlyLeads') + '</option><option value="clients">' + t('crm.onlyClients') + '</option>' + stageOpts(q.stage) + '</select>' +
      '<select class="input" id="cMgr" aria-label="' + t('col.manager') + '"><option value="all">' + t('crm.allManagers') + '</option>' + (myId() ? '<option value="' + myId() + '">' + t('crm.mine') + '</option>' : '') + '<option value="none">' + t('crm.unassigned') + '</option>' + staffOpts(null).replace(/ selected/g, '') + '</select>' +
      '<select class="input" id="cKyc" aria-label="KYC"><option value="all">KYC: ' + t('hist.all') + '</option>' + ['none', 'pending', 'verified', 'rejected'].map((k) => '<option value="' + k + '">KYC: ' + t('kyc.' + k) + '</option>').join('') + '</select>' +
      '<select class="input" id="cSort" aria-label="' + t('term.sort') + '">' + [['createdAt:desc', t('col.created') + ' ↓'], ['createdAt:asc', t('col.created') + ' ↑'], ['name:asc', t('col.client') + ' A–Z'], ['equity:desc', t('acc.equity') + ' ↓'], ['deposits:desc', t('crm.depositsCol') + ' ↓'], ['lastActivityAt:desc', t('col.activity') + ' ↓'], ['stage:asc', t('col.stage')]].map((o) => '<option value="' + o[0] + '">' + U.esc(o[1]) + '</option>').join('') + '</select></div>' +
      '<div id="cTable">' + ui.loading(8) + '</div></section>';
    ['cStage', 'cMgr', 'cKyc'].forEach((id) => { const s = U.$('#' + id, el); s.value = { cStage: q.stage, cMgr: q.managerId, cKyc: q.kyc }[id]; s.addEventListener('change', () => { q.stage = U.$('#cStage', el).value; q.managerId = U.$('#cMgr', el).value; q.kyc = U.$('#cKyc', el).value; q.page = 1; loadClients(); }); });
    U.$('#cSearch', el).addEventListener('input', U.debounce((e) => { q.search = e.target.value; q.page = 1; loadClients(); }, 200));
    const cs = U.$('#cSort', el); cs.value = q.sort + ':' + q.dir; if (!cs.value) cs.selectedIndex = 0;
    cs.addEventListener('change', () => { const [k, d] = cs.value.split(':'); q.sort = k; q.dir = d; q.page = 1; loadClients(); });
    await loadClients();
  }
  async function loadClients() {
    const el = U.$('#cTable', root); if (!el) return;
    const q = st.q;
    try {
      const r = await NX.api.crm.clients(q);
      if (!r.items.length) { el.innerHTML = q.search ? ui.empty(t('search.none'), t('search.noneText', { q: q.search }), 'search') : ui.empty(t('crm.noClients'), '', 'users'); return; }
      const cols = [{ key: 'id', label: 'ID' }, { key: 'name', label: t('col.client') }, { key: 'stage', label: t('col.stage') }, { key: 'managerName', label: t('col.manager') }, { key: 'kyc', label: 'KYC' }, { key: 'equity', label: t('acc.equity'), cls: 'r' }, { key: 'deposits', label: t('crm.depositsCol'), cls: 'r' }, { key: 'createdAt', label: t('col.created') }, { key: 'lastActivityAt', label: t('col.activity') }];
      el.innerHTML = '<div class="table-wrap"><table class="dt cards">' + ui.thead(cols, { key: q.sort, dir: q.dir }) + '<tbody>' + r.items.map((c) => '<tr class="clickable" data-act="openclient" data-id="' + c.id + '" tabindex="0">' +
        td('ID', '<span class="muted">' + c.id + '</span>') + td(t('col.client'), '<div class="asset"><span class="avatar sm">' + U.esc(U.initials(c.name)) + '</span><span>' + U.esc(c.name) + '<small>' + U.esc(c.email) + '</small></span></div>') +
        td(t('col.stage'), ui.status('stage', c.stage)) + td(t('col.manager'), c.managerName ? U.esc(c.managerName) : '<span class="muted">' + t('crm.unassigned') + '</span>') + td('KYC', ui.status('kyc', c.kyc)) +
        td(t('acc.equity'), c.accountId ? U.usd(c.equity) : '—', 'r') + td(t('crm.depositsCol'), c.deposits ? U.usd(c.deposits, 0) : '—', 'r') + td(t('col.created'), U.date(c.createdAt)) + td(t('col.activity'), U.ago(c.lastActivityAt)) + '</tr>').join('') + '</tbody></table></div>' +
        '<div class="pager"><span>' + t('crm.shown', { a: (r.page - 1) * r.pageSize + 1, b: Math.min(r.total, r.page * r.pageSize), n: r.total }) + '</span>' +
        '<span style="display:flex;gap:8px;align-items:center"><label class="sr-only" for="pSize">' + t('crm.pageSize') + '</label><select class="select-sm" id="pSize">' + [10, 25, 50].map((n) => '<option' + (n === r.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
        '<span class="seg"><button data-act="page" data-v="' + (r.page - 1) + '"' + (r.page <= 1 ? ' disabled' : '') + ' aria-label="' + t('crm.prev') + '">‹</button>' + pagesList(r.page, r.pages).map((p) => p === '…' ? '<button disabled>…</button>' : '<button data-act="page" data-v="' + p + '" class="' + (p === r.page ? 'active' : '') + '"' + (p === r.page ? ' aria-current="page"' : '') + '>' + p + '</button>').join('') +
        '<button data-act="page" data-v="' + (r.page + 1) + '"' + (r.page >= r.pages ? ' disabled' : '') + ' aria-label="' + t('crm.next') + '">›</button></span></span></div>';
      U.$('#pSize', el).addEventListener('change', (e) => { q.pageSize = Number(e.target.value); q.page = 1; S.set('crm.pageSize', q.pageSize); loadClients(); });
    } catch (e) { el.innerHTML = ui.error(e, 'reloadClients'); }
  }
  function pagesList(p, n) { if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1); const out = [1]; if (p > 3) out.push('…'); for (let i = Math.max(2, p - 1); i <= Math.min(n - 1, p + 1); i++) out.push(i); if (p < n - 2) out.push('…'); out.push(n); return out; }

  function newClientModal() {
    const m = ui.modal({ title: t('crm.newClient'), body: '<form class="form c2" id="ncForm" novalidate>' + ui.field({ name: 'name', label: t('f.fullName'), required: true }) + ui.field({ name: 'email', label: t('f.email'), type: 'email', required: true }) +
      ui.field({ name: 'phone', label: t('f.phone'), type: 'tel' }) + ui.field({ name: 'country', label: t('f.country'), type: 'select', value: 'UA', options: ['UA', 'PL', 'DE', 'CZ', 'LT', 'LV', 'EE', 'ES', 'IT', 'GB', 'CY', 'AE', 'KZ', 'GE', 'MD'].map((c) => [c, c]) }) +
      ui.field({ name: 'stage', label: t('col.stage'), type: 'select', value: 'new', options: STAGES.map((s) => [s, t('stage.' + s)]) }) + ui.field({ name: 'source', label: t('crm.source'), type: 'select', value: 'manual', options: ['manual', 'website', 'referral', 'ads', 'partner', 'event'].map((s) => [s, t('src.' + s)]) }) +
      '<div class="field" style="grid-column:1/-1"><label for="ncMgr">' + t('col.manager') + '</label><select id="ncMgr" name="managerId">' + staffOpts(myId(), true) + '</select></div></form>',
    footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn primary" id="ncSave">' + t('btn.create') + '</button>' });
    const form = m.el.querySelector('#ncForm');
    m.el.querySelector('#ncSave').onclick = async (e) => {
      const d = ui.formData(form), errs = {};
      if ((d.name || '').trim().length < 2) errs.name = t('err.name');
      if (!U.isEmail(d.email)) errs.email = t('err.email');
      if (!ui.setErrors(form, errs)) return;
      ui.busy(e.target, true);
      try { const c = await NX.api.crm.createClient(d); m.close(); ui.toast(t('crm.created', { id: c.id })); NX.go('/crm/client/' + c.id); }
      catch (x) { ui.busy(e.target, false); if (x.code === 'err.emailTaken' || x.code === 'err.email') ui.setErrors(form, { email: ui.errText(x) }); else ui.toast(ui.errText(x), 'err'); }
    };
  }

  /* ======================= Client card ======================= */
  async function clientCard(el, id) {
    st.cid = id; st.ctab = st.ctab || 'overview';
    el.innerHTML = '<div style="margin-bottom:10px"><a href="#/crm/clients" class="btn sm ghost">← ' + t('nav.crmClients') + '</a></div><div id="ccBody">' + ui.loading(8) + '</div>';
    await ensureStaff();
    await renderClient();
  }
  async function renderClient() {
    const el = U.$('#ccBody', root); if (!el) return;
    try {
      const c = st.client = await NX.api.crm.client(st.cid);
      NX.app.setCrumbTitle(t('crm.clientCard') + ' · ' + c.name);
      const canEdit = NX.api.can('crm.clients.edit'), canAssign = NX.api.can('crm.assign');
      el.innerHTML = '<section class="panel" style="margin-bottom:14px"><div class="crm-head"><span class="avatar">' + U.esc(U.initials(c.name)) + '</span><div style="flex:1;min-width:200px"><h2>' + U.esc(c.name) + '</h2><div class="muted" style="font-size:12px;margin-top:3px">' + c.id + ' · ' + U.esc(c.email) + (c.phone ? ' · ' + U.esc(c.phone) : '') + ' · ' + U.esc(c.country) + '</div>' +
        '<div class="meta">' + ui.status('stage', c.stage) + ui.status('kyc', c.kyc) + (c.tags || []).map((x) => '<span class="pill info">' + U.esc(x) + '</span>').join('') + '<span class="pill gray">' + t('crm.source') + ': ' + t('src.' + (c.source || 'manual')) + '</span></div></div>' +
        '<div class="form" style="grid-template-columns:repeat(3,minmax(140px,1fr));gap:8px;flex:2;min-width:280px">' +
        '<div class="field"><label for="ccStage">' + t('col.stage') + '</label><select id="ccStage"' + (canEdit ? '' : ' disabled') + '>' + stageOpts(c.stage) + '</select></div>' +
        '<div class="field"><label for="ccMgr">' + t('col.manager') + '</label><select id="ccMgr"' + (canAssign ? '' : ' disabled') + '>' + staffOpts(c.managerId, true) + '</select></div>' +
        '<div class="field"><label for="ccKyc">KYC</label><select id="ccKyc"' + (canEdit ? '' : ' disabled') + '>' + ['none', 'pending', 'verified', 'rejected'].map((k) => '<option value="' + k + '"' + (k === c.kyc ? ' selected' : '') + '>' + t('kyc.' + k) + '</option>').join('') + '</select></div></div>' +
        '<div class="actions" style="display:flex;gap:6px;flex-wrap:wrap">' + (canEdit ? '<button class="btn sm" data-act="editclient">' + U.icon('edit') + t('btn.edit') + '</button>' : '') + '<button class="btn sm" data-act="newtask" data-client="' + c.id + '">' + U.icon('tasks') + t('crm.addTask') + '</button></div></div>' +
        '<div class="tabs" role="tablist">' + ['overview', 'trading', 'payments', 'notes', 'tasks', 'history', 'tickets'].map((k) => '<button role="tab" data-act="ctab" data-v="' + k + '" class="' + (st.ctab === k ? 'active' : '') + '" aria-selected="' + (st.ctab === k) + '">' + t('cc.' + k) + countFor(c, k) + '</button>').join('') + '</div><div id="ccTab"></div></section>';
      const bindSel = (id, key) => { const s = U.$('#' + id, el); s.addEventListener('change', async () => { const patch = {}; patch[key] = s.value || null; s.disabled = true; try { await NX.api.crm.updateClient(c.id, patch); ui.toast(t('crm.updated')); await renderClient(); } catch (x) { ui.toast(ui.errText(x), 'err'); s.disabled = false; } }); };
      bindSel('ccStage', 'stage'); bindSel('ccMgr', 'managerId'); bindSel('ccKyc', 'kyc');
      renderCTab();
    } catch (e) { el.innerHTML = ui.error(e, 'reloadClient'); }
  }
  function countFor(c, k) {
    const n = k === 'notes' ? c.notes.length : k === 'tasks' ? c.tasks.filter((x) => x.status === 'open').length : k === 'tickets' ? c.tickets.length : k === 'trading' ? (c.account ? c.account.positions.length : 0) : k === 'payments' ? c.payments.length : 0;
    return n ? ' <span class="badge blue">' + n + '</span>' : '';
  }
  const asset = (id) => '<div class="asset">' + ui.badge(id, 'xs') + '<span>' + U.esc((NX.catalog.get(id) || {}).symbol || id) + '</span></div>';
  function renderCTab() {
    const el = U.$('#ccTab', root), c = st.client; if (!el) return;
    const a = c.account;
    if (st.ctab === 'overview') {
      el.innerHTML = '<div class="panel-body"><div class="grid c4" style="margin-bottom:14px">' +
        stat(t('acc.equity'), a ? U.usd(a.equity) : '—', a ? t('acc.demoAccount') + ' ' + a.account.id : t('crm.noAccount')) + stat(t('acc.cash'), a ? U.usd(a.cash) : '—', a && a.reservedCash ? t('acc.reserved') + ' ' + U.usd(a.reservedCash) : '') +
        stat(t('acc.openPnl'), a ? U.signedUsd(a.unrealizedPnl) : '—', a ? t('acc.realized') + ' ' + U.signedUsd(a.realizedPnl) : '', a ? U.cls(a.unrealizedPnl) : '') + stat(t('crm.depositsCol'), U.usd(c.deposits), t('crm.tradesN', { n: c.trades.length })) + '</div>' +
        '<div class="grid c2"><div><h3 style="font-size:13px;margin:0 0 8px">' + t('crm.contacts') + '</h3><div class="kv"><span>' + t('f.email') + '</span><b>' + U.esc(c.email) + '</b></div><div class="kv"><span>' + t('f.phone') + '</span><b>' + U.esc(c.phone || '—') + '</b></div><div class="kv"><span>' + t('f.country') + '</span><b>' + U.esc(c.country) + '</b></div><div class="kv"><span>' + t('lang.label') + '</span><b>' + t('lang.' + (c.language || 'ru')) + '</b></div><div class="kv"><span>' + t('col.created') + '</span><b>' + U.dateTime(c.createdAt) + '</b></div><div class="kv"><span>' + t('col.activity') + '</span><b>' + U.dateTime(c.lastActivityAt) + '</b></div>' +
        (a ? '<div class="kv"><span>' + t('crm.accountStatus') + '</span><b>' + ui.status('accst', a.account.status) + (NX.api.can('crm.clients.edit') ? ' <button class="btn sm" data-act="accstatus" data-v="' + (a.account.status === 'blocked' ? 'active' : 'blocked') + '">' + t(a.account.status === 'blocked' ? 'crm.unblock' : 'crm.block') + '</button>' : '') + '</b></div>' : '') + '</div>' +
        '<div><h3 style="font-size:13px;margin:0 0 8px;display:flex;gap:8px;align-items:center">' + t('cc.notes') + ' <span class="internal-tag">' + t('crm.internal') + '</span></h3>' + (c.notes.slice(0, 3).map((n) => '<div class="tl" style="padding:8px 0"><span class="ic">' + U.icon('note') + '</span><div><p style="margin:0">' + U.esc(ui.txt(n.text)) + '</p><small>' + U.esc(ui.staffName(n.staffId, st.staff)) + ' · ' + U.ago(n.at) + '</small></div></div>').join('') || '<p class="muted">' + t('crm.noNotes') + '</p>') +
        '<h3 style="font-size:13px;margin:14px 0 8px">' + t('cc.tasks') + '</h3>' + (c.tasks.filter((x) => x.status === 'open').slice(0, 3).map((x) => taskRow(Object.assign({ clientName: c.name }, x))).join('') || '<p class="muted">' + t('crm.noTasks') + '</p>') + '</div></div></div>';
    } else if (st.ctab === 'trading') {
      if (!a) { el.innerHTML = ui.empty(t('crm.noAccount'), t('crm.noAccountText'), 'wallet'); return; }
      const H = [t('col.instrument'), t('col.qty'), t('col.avg'), t('col.price'), t('col.value'), t('col.pnl')];
      const H2 = [t('col.time'), t('col.instrument'), t('col.side'), t('col.qty'), t('col.price'), t('col.notional'), t('col.fee'), t('col.realized')];
      el.innerHTML = '<div class="notice" style="margin:12px 14px 0">' + t('crm.readOnlyTrading') + '</div><div class="panel-title"><h3>' + t('term.tab.positions') + '</h3><small>' + U.esc(a.account.id) + '</small></div>' +
        (a.positions.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + a.positions.map((p) => '<tr>' + td(H[0], asset(p.instrumentId)) + td(H[1], ui.fmtQty(p.instrumentId, p.qty)) + td(H[2], ui.fmtPrice(p.instrumentId, p.avgPrice)) + td(H[3], ui.fmtPrice(p.instrumentId, p.price)) + td(H[4], U.usd(p.valueUsd)) + td(H[5], '<span class="' + U.cls(p.pnlUsd) + '">' + U.signedUsd(p.pnlUsd) + '</span>') + '</tr>').join('') + '</tbody></table></div>' : ui.empty(t('term.noPositions'), '', 'portfolio')) +
        '<div class="panel-title"><h3>' + t('term.tab.orders') + '</h3></div>' + (c.orders.filter((o) => o.status === 'open').length ? '<div class="table-wrap"><table class="dt"><tbody>' + c.orders.filter((o) => o.status === 'open').map((o) => '<tr><td>' + U.dateTime(o.createdAt) + '</td><td>' + asset(o.instrumentId) + '</td><td>' + ui.side(o.side) + '</td><td>' + t('order.' + o.type) + '</td><td>' + ui.fmtQty(o.instrumentId, o.qty) + '</td><td>' + ui.fmtPrice(o.instrumentId, o.limitPrice) + '</td><td>' + ui.status('ost', o.status) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted" style="padding:0 14px">' + t('term.noOrders') + '</p>') +
        '<div class="panel-title"><h3>' + t('term.tab.trades') + '</h3></div>' + (c.trades.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H2.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + c.trades.slice(0, 50).map((x) => '<tr>' + td(H2[0], U.dateTime(x.at)) + td(H2[1], asset(x.instrumentId)) + td(H2[2], ui.side(x.side)) + td(H2[3], ui.fmtQty(x.instrumentId, x.qty)) + td(H2[4], ui.fmtPrice(x.instrumentId, x.price)) + td(H2[5], U.usd(x.notionalUsd)) + td(H2[6], U.usd(x.fee)) + td(H2[7], x.realizedPnl == null ? '—' : '<span class="' + U.cls(x.realizedPnl) + '">' + U.signedUsd(x.realizedPnl) + '</span>') + '</tr>').join('') + '</tbody></table></div>' : ui.empty(t('term.noTrades'), '', 'history'));
    } else if (st.ctab === 'payments') {
      const H = [t('col.time'), t('col.id'), t('col.type'), t('col.amount'), t('col.usd'), t('col.status'), ''];
      el.innerHTML = c.payments.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + c.payments.map((p) => '<tr>' + td(H[0], U.dateTime(p.createdAt)) + td(H[1], p.id) + td(H[2], t('ptype.' + p.type)) + td(H[3], U.fmtMax(p.amount, 8) + ' ' + p.asset + ' <span class="muted">' + (p.network || '') + '</span>') + td(H[4], U.usd(p.amountUsd)) + td(H[5], ui.status('pst', p.status)) +
        td('', p.type === 'withdrawal' && p.status === 'review' && NX.api.can('payments.approve') ? '<button class="btn sm buy" data-act="wdok" data-id="' + p.id + '">' + t('crm.approve') + '</button> <button class="btn sm danger" data-act="wdno" data-id="' + p.id + '">' + t('crm.reject') + '</button>' : '') + '</tr>').join('') + '</tbody></table></div>' : ui.empty(t('wallet.noRequests'), '', 'wallet');
    } else if (st.ctab === 'notes') {
      el.innerHTML = '<div class="panel-body"><div class="notice warn" style="margin-bottom:12px">' + t('crm.notesInternal') + '</div>' + (NX.api.can('crm.notes') ? '<form class="form" id="noteForm"><div class="field" data-field="text"><label for="noteText">' + t('crm.newNote') + '</label><textarea id="noteText" name="text" maxlength="4000" placeholder="' + t('crm.notePh') + '"></textarea><span class="err"></span></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="check"><input type="checkbox" name="pinned"> ' + t('crm.pin') + '</label><button class="btn primary" type="submit">' + t('crm.addNote') + '</button></div></form>' : '') + '</div>' +
        '<div class="timeline">' + (c.notes.length ? c.notes.map((n) => '<div class="tl"><span class="ic">' + U.icon('note') + '</span><div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>' + U.esc(ui.staffName(n.staffId, st.staff)) + (n.pinned ? ' 📌' : '') + ' <span class="internal-tag">' + t('crm.internal') + '</span></b><span><button class="btn sm ghost" data-act="pin" data-id="' + n.id + '">' + t(n.pinned ? 'crm.unpin' : 'crm.pin') + '</button><button class="btn sm ghost" data-act="delnote" data-id="' + n.id + '" aria-label="' + t('btn.delete') + '">' + U.icon('trash') + '</button></span></div><p>' + U.esc(ui.txt(n.text)) + '</p><small>' + U.dateTime(n.at) + '</small></div></div>').join('') : ui.empty(t('crm.noNotes'), '', 'note')) + '</div>';
      const f = U.$('#noteForm', el);
      if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const d = ui.formData(f); if (!ui.setErrors(f, (d.text || '').trim().length < 2 ? { text: t('err.note') } : {})) return; const b = f.querySelector('[type=submit]'); ui.busy(b, true); try { await NX.api.crm.addNote(c.id, d.text, !!f.pinned.checked); ui.toast(t('crm.noteAdded')); await renderClient(); } catch (x) { ui.toast(ui.errText(x), 'err'); ui.busy(b, false); } });
    } else if (st.ctab === 'tasks') {
      el.innerHTML = '<div class="panel-body" style="padding-bottom:0"><button class="btn primary" data-act="newtask" data-client="' + c.id + '">' + U.icon('plus') + t('crm.addTask') + '</button></div>' + (c.tasks.length ? c.tasks.map((x) => taskRow(Object.assign({ clientName: c.name }, x))).join('') : ui.empty(t('crm.noTasks'), '', 'tasks'));
    } else if (st.ctab === 'history') {
      el.innerHTML = '<div class="panel-body"><form class="form inline-log" id="logForm"><div class="field"><label for="logType">' + t('crm.logType') + '</label><select id="logType" name="type">' + ['call', 'email', 'meeting', 'chat'].map((x) => '<option value="' + x + '">' + t('itype.' + x) + '</option>').join('') + '</select></div><div class="field" data-field="text"><label for="logText">' + t('crm.logText') + '</label><input id="logText" name="text" maxlength="2000" placeholder="' + t('crm.logPh') + '"><span class="err"></span></div><button class="btn primary" type="submit">' + t('crm.log') + '</button></form></div>' +
        '<div class="timeline">' + (c.interactions.length ? c.interactions.map(tlItem).join('') : ui.empty(t('crm.noHistory'), '', 'history')) + '</div>';
      const f = U.$('#logForm', el);
      f.addEventListener('submit', async (e) => { e.preventDefault(); const d = ui.formData(f); if (!ui.setErrors(f, (d.text || '').trim().length < 2 ? { text: t('err.message') } : {})) return; try { await NX.api.crm.logInteraction(c.id, d.type, d.text); ui.toast(t('crm.logged')); await renderClient(); } catch (x) { ui.toast(ui.errText(x), 'err'); } });
    } else if (st.ctab === 'tickets') {
      el.innerHTML = c.tickets.length ? c.tickets.map((tk) => '<a class="mover" style="grid-template-columns:minmax(0,1fr) auto;color:inherit" href="#/crm/tickets/' + tk.id + '"><span><b>' + U.esc(ui.txt(tk.subject)) + '</b><small>' + tk.id + ' · ' + t('tcat.' + tk.category) + ' · ' + U.ago(tk.updatedAt) + '</small></span>' + ui.status('tst', tk.status) + '</a>').join('') : ui.empty(t('sup.none'), '', 'support');
    }
  }
  const IICON = { call: 'phone', email: 'mail', meeting: 'calendar', chat: 'support', system: 'info' };
  function tlItem(x) {
    const title = x.type === 'system' ? t(x.key, sysVars(x.vars)) : t('itype.' + x.type);
    return '<div class="tl"><span class="ic">' + U.icon(IICON[x.type] || 'info') + '</span><div><b>' + U.esc(title) + '</b>' + (x.text ? '<p>' + U.esc(ui.txt(x.text)) + '</p>' : '') + '<small>' + U.dateTime(x.at) + (x.staffId ? ' · ' + U.esc(ui.staffName(x.staffId, st.staff)) : ' · ' + t('crm.system')) + '</small></div></div>';
  }
  function sysVars(v) { v = Object.assign({}, v || {}); if (v.side) v.side = t('side.' + v.side); ['stage', 'from', 'to'].forEach((k) => { if (v[k] && NX.i18n.has('stage.' + v[k])) v[k] = t('stage.' + v[k]); }); if (v.kyc) v.kyc = t('kyc.' + v.kyc); if (v.status && NX.i18n.has('tst.' + v.status)) v.status = t('tst.' + v.status); else if (v.status && NX.i18n.has('accst.' + v.status)) v.status = t('accst.' + v.status); if (v.source) v.source = t('src.' + v.source); return v; }

  function editClientModal() {
    const c = st.client;
    const m = ui.modal({ title: t('crm.editClient'), body: '<form class="form c2" id="ecForm" novalidate>' + ui.field({ name: 'name', label: t('f.fullName'), value: c.name }) + ui.field({ name: 'email', label: t('f.email'), type: 'email', value: c.email }) + ui.field({ name: 'phone', label: t('f.phone'), value: c.phone }) +
      ui.field({ name: 'country', label: t('f.country'), value: c.country }) + ui.field({ name: 'tags', label: t('crm.tags'), value: (c.tags || []).join(', '), hint: t('crm.tagsHint') }) + ui.field({ name: 'language', label: t('lang.label'), type: 'select', value: c.language, options: NX.i18n.langs.map((l) => [l, t('lang.' + l)]) }) + '</form>',
    footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn primary" id="ecSave">' + t('btn.save') + '</button>' });
    const form = m.el.querySelector('#ecForm');
    m.el.querySelector('#ecSave').onclick = async (e) => {
      const d = ui.formData(form), errs = {};
      if ((d.name || '').trim().length < 2) errs.name = t('err.name');
      if (!U.isEmail(d.email)) errs.email = t('err.email');
      if (!ui.setErrors(form, errs)) return;
      ui.busy(e.target, true);
      try { await NX.api.crm.updateClient(c.id, { name: d.name, email: d.email, phone: d.phone, country: d.country, language: d.language, tags: d.tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8) }); m.close(); ui.toast(t('crm.updated')); await renderClient(); }
      catch (x) { ui.busy(e.target, false); ui.toast(ui.errText(x), 'err'); }
    };
  }

  /* ======================= Funnel ======================= */
  async function funnel(el) {
    await ensureStaff();
    st.fm = st.fm || 'all';
    el.innerHTML = head(t('nav.crmFunnel'), t('crm.funnelDesc'), '<select class="input" id="fMgr" style="width:auto" aria-label="' + t('col.manager') + '"><option value="all">' + t('crm.allManagers') + '</option>' + (myId() ? '<option value="' + myId() + '">' + t('crm.mine') + '</option>' : '') + '</select>') + '<div id="fBoard">' + ui.loading(6) + '</div>';
    U.$('#fMgr', el).value = st.fm;
    U.$('#fMgr', el).addEventListener('change', (e) => { st.fm = e.target.value; renderFunnel(); });
    // Stage <select> on each card (touch / keyboard alternative to drag & drop); bound once.
    U.$('#fBoard', el).addEventListener('change', (e) => { const id = e.target.dataset && e.target.dataset.stagesel; if (id) moveStage(id, e.target.value); });
    await renderFunnel();
  }
  async function renderFunnel() {
    const el = U.$('#fBoard', root); if (!el) return;
    try {
      let all = await NX.api.crm.clientsBrief();
      if (st.fm !== 'all') all = all.filter((c) => c.managerId === st.fm);
      const canEdit = NX.api.can('crm.clients.edit');
      el.innerHTML = '<div class="funnel">' + STAGES.map((s) => { const list = all.filter((c) => c.stage === s); return '<section class="fcol" data-stage="' + s + '" aria-label="' + t('stage.' + s) + '"><header><span>' + t('stage.' + s) + '</span><span class="badge blue">' + list.length + '</span></header><div class="cards">' +
        (list.length ? list.slice(0, 40).map((c) => '<article class="fcard" draggable="' + canEdit + '" data-id="' + c.id + '"><div class="row"><b><a href="#/crm/client/' + c.id + '" style="color:inherit">' + U.esc(c.name) + '</a></b>' + ui.status('kyc', c.kyc) + '</div><small>' + c.id + ' · ' + U.esc(ui.staffName(c.managerId, st.staff)) + '</small>' +
          (canEdit ? '<div class="row"><label class="sr-only" for="fs_' + c.id + '">' + t('col.stage') + '</label><select id="fs_' + c.id + '" data-stagesel="' + c.id + '">' + stageOpts(c.stage) + '</select><small>' + U.date(c.createdAt) + '</small></div>' : '') + '</article>').join('') + (list.length > 40 ? '<small class="muted">+' + (list.length - 40) + '</small>' : '') : '<small class="muted" style="text-align:center;padding:16px 0">' + t('crm.dropHere') + '</small>') + '</div></section>'; }).join('') + '</div>' +
        '<p class="muted" style="font-size:11px">' + t('crm.funnelHint') + '</p>';
      // Drag & drop (desktop) + select (touch / keyboard)
      el.querySelectorAll('.fcard[draggable=true]').forEach((card) => card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; }));
      el.querySelectorAll('.fcol').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
        col.addEventListener('dragleave', () => col.classList.remove('drop'));
        col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id) moveStage(id, col.dataset.stage); });
      });
    } catch (e) { el.innerHTML = ui.error(e, 'reloadFunnel'); }
  }
  async function moveStage(id, stage) {
    try { await NX.api.crm.updateClient(id, { stage }); ui.toast(t('crm.stageMoved', { stage: t('stage.' + stage) })); await renderFunnel(); }
    catch (x) { ui.toast(ui.errText(x), 'err'); }
  }

  /* ======================= Tasks ======================= */
  async function tasks(el) {
    await ensureStaff();
    st.tf = st.tf || { status: 'open', assigneeId: S.state.session.role === 'manager' ? myId() : 'all' };
    el.innerHTML = head(t('nav.crmTasks'), t('crm.tasksDesc'), '<button class="btn primary" data-act="newtask">' + U.icon('plus') + t('crm.addTask') + '</button>') +
      '<section class="panel"><div class="toolbar"><div class="chips">' + ['open', 'overdue', 'done', 'all'].map((s) => '<button class="chip ' + (st.tf.status === s ? 'active' : '') + '" data-act="tstatus" data-v="' + s + '">' + t('tstatus.' + s) + '</button>').join('') + '</div>' +
      '<select class="input" id="tAss" aria-label="' + t('crm.assignee') + '"><option value="all">' + t('crm.allManagers') + '</option>' + staffOpts(st.tf.assigneeId) + '</select></div><div id="tList">' + ui.loading(5) + '</div></section>';
    U.$('#tAss', el).value = st.tf.assigneeId;
    U.$('#tAss', el).addEventListener('change', (e) => { st.tf.assigneeId = e.target.value; loadTasks(); });
    await loadTasks();
  }
  async function loadTasks() {
    const el = U.$('#tList', root); if (!el) return;
    try { const list = await NX.api.crm.tasks(st.tf); el.innerHTML = list.length ? list.map((x) => taskRow(x).replace('</small></div>', ' · ' + U.esc(ui.staffName(x.assigneeId, st.staff)) + '</small></div>')).join('') : ui.empty(t('crm.noTasks'), '', 'tasks'); }
    catch (e) { el.innerHTML = ui.error(e, 'reloadTasks'); }
  }
  async function newTaskModal(clientId) {
    await ensureStaff();
    const brief = await NX.api.crm.clientsBrief();
    const now = NX.market.now(), due = U.toLocalInput(now + 3 * 3600000);
    const m = ui.modal({ title: t('crm.addTask'), body: '<form class="form c2" id="ntForm" novalidate>' +
      '<div class="field" data-field="title" style="grid-column:1/-1"><label for="ntTitle">' + t('crm.taskTitle') + '</label><input id="ntTitle" name="title" maxlength="200"><span class="err"></span></div>' +
      '<div class="field" style="grid-column:1/-1"><label for="ntClient">' + t('col.client') + '</label><select id="ntClient" name="clientId"><option value="">—</option>' + brief.map((c) => '<option value="' + c.id + '"' + (c.id === clientId ? ' selected' : '') + '>' + U.esc(c.name) + ' (' + c.id + ')</option>').join('') + '</select></div>' +
      ui.field({ name: 'type', label: t('crm.taskType'), type: 'select', value: 'call', options: ['call', 'email', 'meeting', 'todo'].map((x) => [x, t('ttype.' + x)]) }) +
      ui.field({ name: 'priority', label: t('crm.priority'), type: 'select', value: 'normal', options: ['low', 'normal', 'high'].map((x) => [x, t('prio.' + x)]) }) +
      ui.field({ name: 'dueAt', label: t('crm.due'), type: 'datetime-local', value: due }) +
      ui.field({ name: 'remind', label: t('crm.remind'), type: 'select', value: '15', options: [['', t('crm.noRemind')], ['0', t('crm.remindAtDue')], ['15', t('crm.remindMin', { n: 15 })], ['60', t('crm.remindMin', { n: 60 })], ['1440', t('crm.remindDay')], ['1', t('crm.remindDemo')]] }) +
      '<div class="field" style="grid-column:1/-1"><label for="ntAss">' + t('crm.assignee') + '</label><select id="ntAss" name="assigneeId">' + staffOpts(myId()) + '</select></div></form>',
    footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn primary" id="ntSave">' + t('btn.create') + '</button>' });
    const form = m.el.querySelector('#ntForm');
    m.el.querySelector('#ntSave').onclick = async (e) => {
      const d = ui.formData(form), errs = {};
      if ((d.title || '').trim().length < 2) errs.title = t('err.title');
      const dueAt = new Date(d.dueAt).getTime(); if (!(dueAt > 0)) errs.dueAt = t('err.due');
      if (!ui.setErrors(form, errs)) return;
      let remindAt = null;
      if (d.remind === '1') remindAt = NX.market.now() + 20000; // demo: remind in ~20 s
      else if (d.remind !== '') remindAt = dueAt - Number(d.remind) * 60000;
      ui.busy(e.target, true);
      try { await NX.api.crm.createTask({ title: d.title, clientId: d.clientId || null, type: d.type, priority: d.priority, dueAt, remindAt, assigneeId: d.assigneeId }); m.close(); ui.toast(t('crm.taskCreated')); refresh(); }
      catch (x) { ui.busy(e.target, false); ui.toast(ui.errText(x), 'err'); }
    };
  }

  /* ======================= Tickets ======================= */
  async function tickets(el, id) {
    await ensureStaff();
    st.tkf = st.tkf || 'open';
    if (id) st.tkid = id;
    el.innerHTML = head(t('nav.crmTickets'), t('crm.ticketsDesc')) + '<div class="split side-left" id="tkRow"><section class="panel"><div class="toolbar"><div class="chips">' + ['open', 'in_progress', 'resolved', 'all'].map((s) => '<button class="chip ' + (st.tkf === s ? 'active' : '') + '" data-act="tkfilter" data-v="' + s + '">' + t(s === 'all' ? 'hist.all' : 'tst.' + s) + '</button>').join('') + '</div></div><div id="tkList">' + ui.loading(5) + '</div></section><section class="panel" id="tkThread">' + ui.empty(t('sup.pick'), '', 'ticket') + '</section></div>';
    await loadTickets();
  }
  async function loadTickets() {
    const el = U.$('#tkList', root); if (!el) return;
    try {
      const list = st.tklist = await NX.api.support.list({ status: st.tkf });
      el.innerHTML = list.length ? list.map((tk) => '<button class="mover" style="grid-template-columns:minmax(0,1fr) auto' + (tk.id === st.tkid ? ';background:#13304a' : '') + '" data-act="tkopen" data-id="' + tk.id + '"><span><b>' + U.esc(ui.txt(tk.subject)) + '</b><small>' + U.esc(tk.clientName || tk.clientId) + ' · ' + tk.id + ' · ' + t('tcat.' + tk.category) + ' · ' + U.ago(tk.updatedAt) + '</small></span>' + ui.status('tst', tk.status) + '</button>').join('') : ui.empty(t('sup.none'), '', 'ticket');
      if (st.tkid) { const all = await NX.api.support.list({ status: 'all' }); st.tkall = all; renderTicket(); }
    } catch (e) { el.innerHTML = ui.error(e, 'reloadTickets'); }
  }
  function renderTicket() {
    const el = U.$('#tkThread', root), tk = (st.tkall || []).find((x) => x.id === st.tkid); if (!el || !tk) return;
    const canReply = NX.api.can('crm.tickets');
    el.innerHTML = '<div class="panel-title"><div><h3>' + U.esc(ui.txt(tk.subject)) + '</h3><small><a href="#/crm/client/' + tk.clientId + '">' + U.esc(tk.clientName || tk.clientId) + '</a> · ' + tk.id + ' · ' + t('tcat.' + tk.category) + '</small></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><select class="select-sm" id="tkStatus" aria-label="' + t('col.status') + '"' + (canReply ? '' : ' disabled') + '>' + ['open', 'in_progress', 'resolved', 'closed'].map((s) => '<option value="' + s + '"' + (s === tk.status ? ' selected' : '') + '>' + t('tst.' + s) + '</option>').join('') + '</select>' +
      '<select class="select-sm" id="tkAss" aria-label="' + t('crm.assignee') + '"' + (canReply ? '' : ' disabled') + '>' + staffOpts(tk.assigneeId, true) + '</select></div></div>' +
      '<div class="thread">' + tk.messages.map((m) => '<div class="bubble ' + (m.author === 'staff' ? 'mine' : '') + '"><small>' + (m.author === 'staff' ? U.esc(ui.staffName(m.staffId, st.staff)) : U.esc(tk.clientName || t('role.client'))) + ' · ' + U.dateTime(m.at) + '</small>' + U.esc(ui.txt(m.text)) + '</div>').join('') + '</div>' +
      (canReply ? '<form class="reply" id="tkReply"><label class="sr-only" for="tkText">' + t('sup.reply') + '</label><input class="input" id="tkText" name="text" maxlength="2000" placeholder="' + t('crm.replyPh') + '" autocomplete="off"><button class="btn primary" type="submit">' + t('btn.send') + '</button></form>' : '');
    const th = el.querySelector('.thread'); th.scrollTop = th.scrollHeight;
    const upd = async (patch) => { try { await NX.api.support.update(tk.id, patch); ui.toast(t('crm.updated')); await loadTickets(); } catch (x) { ui.toast(ui.errText(x), 'err'); } };
    const ss = U.$('#tkStatus', el); if (ss) ss.addEventListener('change', () => upd({ status: ss.value }));
    const sa = U.$('#tkAss', el); if (sa) sa.addEventListener('change', () => upd({ assigneeId: sa.value }));
    const f = U.$('#tkReply', el);
    if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const v = f.text.value; if (!v.trim()) { f.text.focus(); return; } const b = f.querySelector('button'); ui.busy(b, true); try { await NX.api.support.reply(tk.id, v); f.text.value = ''; ui.toast(t('crm.replied')); await loadTickets(); } catch (x) { ui.toast(ui.errText(x), 'err'); } finally { ui.busy(b, false); } });
  }

  /* ======================= Payments review ======================= */
  async function payments(el) {
    el.innerHTML = head(t('nav.crmPayments'), t('crm.paymentsDesc')) + (NX.api.can('payments.approve') ? '' : '<div class="notice warn" style="margin-bottom:12px">' + t('crm.approveAdminOnly') + '</div>') + '<section class="panel"><div class="panel-title"><h3>' + t('crm.pendingWd') + '</h3><span class="pill warn">' + t('demo.badge') + '</span></div><div id="pmList">' + ui.loading(4) + '</div></section>';
    await loadPayments();
  }
  async function loadPayments() {
    const el = U.$('#pmList', root); if (!el) return;
    try {
      const list = await NX.api.payments.pending(), can = NX.api.can('payments.approve');
      const H = [t('col.time'), t('col.client'), t('col.id'), t('col.amount'), t('col.usd'), t('wallet.address'), ''];
      el.innerHTML = list.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + list.map((p) => '<tr>' + td(H[0], U.dateTime(p.createdAt)) + td(H[1], '<a href="#/crm/client/' + p.clientId + '">' + U.esc(p.clientName) + '</a>') + td(H[2], p.id) + td(H[3], U.fmtMax(p.amount, 8) + ' ' + p.asset + ' <span class="muted">' + p.network + '</span>') + td(H[4], U.usd(p.amountUsd)) + td(H[5], '<span class="muted">' + U.esc(p.address) + '</span>') +
        td('', can ? '<button class="btn sm buy" data-act="wdok" data-id="' + p.id + '">' + t('crm.approve') + '</button> <button class="btn sm danger" data-act="wdno" data-id="' + p.id + '">' + t('crm.reject') + '</button>' : ui.status('pst', p.status)) + '</tr>').join('') + '</tbody></table></div>' : ui.empty(t('crm.noPending'), t('crm.noPendingText'), 'check');
    } catch (e) { el.innerHTML = ui.error(e, 'reloadPayments'); }
  }
  async function reviewWd(id, ok) {
    let reason = '';
    if (!ok) {
      const m = await new Promise((resolve) => {
        const md = ui.modal({ title: t('crm.rejectTitle'), body: '<form class="form" id="rjForm">' + ui.field({ name: 'reason', label: t('crm.rejectReason'), type: 'textarea', max: 300 }) + '</form>', footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn danger" id="rjOk">' + t('crm.reject') + '</button>', onClose: () => resolve(null) });
        md.el.querySelector('#rjOk').onclick = () => { const v = md.el.querySelector('textarea').value; resolve(v || t('crm.rejectDefault')); md.close(); };
      });
      if (m == null) return; reason = m;
    }
    try { await NX.api.payments.review(id, ok, reason); ui.toast(t(ok ? 'crm.wdApproved' : 'crm.wdRejected')); refresh(); }
    catch (x) { ui.toast(ui.errText(x), 'err'); }
  }

  /* ======================= View plumbing ======================= */
  const RENDER = { dashboard, clients, client: (el, p) => clientCard(el, p.id), funnel, tasks, tickets: (el, p) => tickets(el, p.id), payments };
  function refresh() {
    if (!st) return;
    if (st.tab === 'dashboard') dashboard(root);
    else if (st.tab === 'clients') loadClients();
    else if (st.tab === 'client') renderClient();
    else if (st.tab === 'funnel') renderFunnel();
    else if (st.tab === 'tasks') loadTasks();
    else if (st.tab === 'tickets') loadTickets();
    else if (st.tab === 'payments') loadPayments();
  }
  const handlers = {
    reload: () => refresh(), reloadClients: () => loadClients(), reloadClient: () => renderClient(), reloadFunnel: () => renderFunnel(), reloadTasks: () => loadTasks(), reloadTickets: () => loadTickets(), reloadPayments: () => loadPayments(),
    newclient: () => newClientModal(),
    openclient: (el, e) => { if (e.target.closest('a')) return; NX.go('/crm/client/' + el.dataset.id); },
    sort: (el) => { const k = el.dataset.key; if (st.q.sort === k) st.q.dir = st.q.dir === 'asc' ? 'desc' : 'asc'; else { st.q.sort = k; st.q.dir = k === 'name' || k === 'id' ? 'asc' : 'desc'; } const cs = U.$('#cSort', root); if (cs) { cs.value = st.q.sort + ':' + st.q.dir; } loadClients(); },
    page: (el) => { st.q.page = Number(el.dataset.v); loadClients(); },
    ctab: (el) => { st.ctab = el.dataset.v; U.$$('[data-act=ctab]', root).forEach((b) => { b.classList.toggle('active', b === el); b.setAttribute('aria-selected', b === el); }); renderCTab(); },
    editclient: () => editClientModal(),
    accstatus: async (el) => { try { await NX.api.crm.updateClient(st.client.id, { accountStatus: el.dataset.v }); ui.toast(t('crm.updated')); renderClient(); } catch (x) { ui.toast(ui.errText(x), 'err'); } },
    pin: async (el) => { await NX.api.crm.togglePin(el.dataset.id); renderClient(); },
    delnote: async (el) => { if (await ui.confirm(t('crm.delNote'), t('crm.delNoteText'), t('btn.delete'), true)) { await NX.api.crm.deleteNote(el.dataset.id); ui.toast(t('crm.noteDeleted'), 'info'); renderClient(); } },
    newtask: (el) => newTaskModal(el.dataset.client || (st.tab === 'client' ? st.cid : null)),
    taskdone: async (el) => { try { await NX.api.crm.updateTask(el.dataset.id, { status: el.checked ? 'done' : 'open' }); ui.toast(t(el.checked ? 'crm.taskDone' : 'crm.taskReopened'), 'info', 1800); refresh(); } catch (x) { ui.toast(ui.errText(x), 'err'); } },
    snooze: async (el) => { const tk = await NX.api.crm.updateTask(el.dataset.id, { dueAt: NX.market.now() + 3600000, snoozeMin: 55 }); ui.toast(t('crm.snoozed', { time: U.time(tk.dueAt) }), 'info'); refresh(); },
    tstatus: (el) => { st.tf.status = el.dataset.v; U.$$('[data-act=tstatus]', root).forEach((b) => b.classList.toggle('active', b === el)); loadTasks(); },
    tkfilter: (el) => { st.tkf = el.dataset.v; U.$$('[data-act=tkfilter]', root).forEach((b) => b.classList.toggle('active', b === el)); loadTickets(); },
    tkopen: (el) => { st.tkid = el.dataset.id; history.replaceState(null, '', '#/crm/tickets/' + st.tkid); loadTickets(); if (window.innerWidth < 1020) U.$('#tkThread', root).scrollIntoView({ behavior: 'smooth' }); },
    wdok: (el) => reviewWd(el.dataset.id, true),
    wdno: (el) => reviewWd(el.dataset.id, false)
  };

  NX.views = NX.views || {};
  NX.views.crm = {
    title: (p) => t({ dashboard: 'nav.crmDashboard', clients: 'nav.crmClients', client: 'crm.clientCard', funnel: 'nav.crmFunnel', tasks: 'nav.crmTasks', tickets: 'nav.crmTickets', payments: 'nav.crmPayments' }[p.tab]),
    mount(el, params) {
      root = el; st = { tab: params.tab, q: null, staff: null };
      offs.push(ui.delegate(el, handlers));
      offs.push(ui.delegate(el, { 'keydown:openclient': (row, e) => { if (e.key === 'Enter') NX.go('/crm/client/' + row.dataset.id); }, 'keydown:sort': (th, e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.sort(th); } } }, ['keydown']));
      // Changes made in the cabinet (trades, tickets, payments) or another tab refresh CRM views.
      offs.push(NX.bus.on('db:change', U.debounce(() => { if (st && !document.querySelector('.modal-back') && !root.contains(document.activeElement)) refresh(); }, 250)));
      RENDER[params.tab](el, params);
    },
    update(params, route) { if (!st || route.tab !== 'tickets' || !params.id) return false; st.tkid = params.id; loadTickets(); return true; },
    unmount() { offs.forEach((f) => f()); offs = []; st = null; root = null; }
  };
})(window.NX);
