/* NEXORA administration: staff, roles & permissions, instruments, fees, platform settings.
   Role checks here are UI hints only — real access control must be enforced by the backend. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v);
  const PERMS = ['terminal.trade', 'cabinet.view', 'market.view', 'crm.view', 'crm.clients.create', 'crm.clients.edit', 'crm.assign', 'crm.notes', 'crm.tasks', 'crm.tickets', 'payments.approve', 'admin.staff', 'admin.roles', 'admin.instruments', 'admin.fees', 'admin.settings', 'demo.reset'];
  let st = null, root = null, offs = [];

  const head = (title, desc, actions) => '<div class="heading"><div><h1>' + title + '</h1><p>' + desc + '</p></div><div class="actions">' + (actions || '') + '</div></div>';
  const serverNote = () => '<div class="notice warn" style="margin-bottom:14px">' + U.icon('lock').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"') + ' ' + t('adm.serverNote') + '</div>';
  const td = (label, v, cls) => '<td data-label="' + U.esc(label) + '" class="' + (cls || '') + '">' + v + '</td>';

  /* ---------- Staff ---------- */
  async function staff(el) {
    el.innerHTML = head(t('nav.adminStaff'), t('adm.staffDesc'), '<button class="btn primary" data-act="addstaff">' + U.icon('plus') + t('adm.addStaff') + '</button>') + serverNote() + '<section class="panel" id="sBody">' + ui.loading(5) + '</section>';
    try {
      const [list, roles] = await Promise.all([NX.api.admin.staff(), NX.api.admin.roles()]);
      st.staff = list; st.roles = roles;
      const brief = await NX.api.crm.clientsBrief();
      const H = [t('col.name'), t('f.email'), t('adm.role'), t('adm.clients'), t('col.status'), ''];
      U.$('#sBody', el).innerHTML = '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + list.map((s) => '<tr>' +
        td(H[0], '<div class="asset"><span class="avatar sm">' + U.esc(U.initials(s.name)) + '</span>' + U.esc(s.name) + '<small style="margin-left:4px">' + s.id + '</small></div>') + td(H[1], U.esc(s.email)) + td(H[2], U.esc(ui.txt((roles.find((r) => r.id === s.role) || {}).name) || s.role)) +
        td(H[3], brief.filter((c) => c.managerId === s.id).length) + td(H[4], ui.status('accst', s.active ? 'active' : 'blocked')) + td('', '<button class="btn sm" data-act="editstaff" data-id="' + s.id + '">' + t('btn.edit') + '</button>') + '</tr>').join('') + '</tbody></table></div>';
    } catch (e) { U.$('#sBody', el).innerHTML = ui.error(e, 'reload'); }
  }
  function staffModal(s) {
    s = s || { name: '', email: '', role: 'manager', phone: '', active: true };
    const m = ui.modal({ title: s.id ? t('adm.editStaff') : t('adm.addStaff'), body: '<form class="form c2" id="stForm" novalidate>' + ui.field({ name: 'name', label: t('f.fullName'), value: s.name }) + ui.field({ name: 'email', label: t('f.email'), type: 'email', value: s.email }) +
      ui.field({ name: 'phone', label: t('f.phone'), value: s.phone }) + ui.field({ name: 'role', label: t('adm.role'), type: 'select', value: s.role, options: st.roles.filter((r) => r.id !== 'client').map((r) => [r.id, ui.txt(r.name)]) }) +
      (s.id ? '<label class="check" style="grid-column:1/-1"><input type="checkbox" name="active"' + (s.active ? ' checked' : '') + '> ' + t('adm.active') + '</label>' : '') + '<p class="muted" style="grid-column:1/-1;font-size:11px;margin:0">' + t('adm.noPasswords') + '</p></form>',
    footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn primary" id="stSave">' + t('btn.save') + '</button>' });
    const form = m.el.querySelector('#stForm');
    m.el.querySelector('#stSave').onclick = async (e) => {
      const d = ui.formData(form), errs = {};
      if ((d.name || '').trim().length < 2) errs.name = t('err.name');
      if (!U.isEmail(d.email)) errs.email = t('err.email');
      if (!ui.setErrors(form, errs)) return;
      ui.busy(e.target, true);
      try { await NX.api.admin.saveStaff({ id: s.id, name: d.name, email: d.email, phone: d.phone, role: d.role, active: s.id ? !!form.active.checked : true }); m.close(); ui.toast(t('saved')); staff(root); }
      catch (x) { ui.busy(e.target, false); ui.toast(ui.errText(x), 'err'); }
    };
  }

  /* ---------- Roles ---------- */
  async function roles(el) {
    el.innerHTML = head(t('nav.adminRoles'), t('adm.rolesDesc')) + serverNote() + '<section class="panel" id="rBody">' + ui.loading(6) + '</section>';
    try {
      const rs = await NX.api.admin.roles(); st.roles = rs;
      U.$('#rBody', el).innerHTML = '<div class="table-wrap"><table class="dt perm-table"><thead><tr><th>' + t('adm.permission') + '</th>' + rs.map((r) => '<th>' + U.esc(ui.txt(r.name)) + '</th>').join('') + '</tr></thead><tbody>' +
        PERMS.map((p) => '<tr><td><b>' + t('perm.' + p) + '</b><br><small class="muted">' + p + '</small></td>' + rs.map((r) => '<td><input type="checkbox" style="accent-color:#19c2ff;width:17px;height:17px" data-perm="' + p + '" data-role="' + r.id + '"' + (r.permissions.indexOf(p) >= 0 ? ' checked' : '') + ' aria-label="' + U.esc(ui.txt(r.name) + ': ' + t('perm.' + p)) + '"></td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
        '<div class="panel-body"><h3 style="font-size:13px;margin:0 0 8px">' + t('adm.demoSwitch') + '</h3><p class="muted" style="margin:0;line-height:1.6">' + t('adm.demoSwitchText') + '</p></div>';
      U.$('#rBody', el).addEventListener('change', async (e) => {
        const cb = e.target; if (!cb.dataset.perm) return;
        try { await NX.api.admin.setPermission(cb.dataset.role, cb.dataset.perm, cb.checked); ui.toast(t('saved'), 'info', 1500); NX.app.refreshShell(); }
        catch (x) { cb.checked = !cb.checked; ui.toast(ui.errText(x), 'err'); }
      });
    } catch (e) { U.$('#rBody', el).innerHTML = ui.error(e, 'reload'); }
  }

  /* ---------- Instruments ---------- */
  async function instruments(el) {
    st.im = st.im || 'crypto'; st.iq = st.iq || '';
    el.innerHTML = head(t('nav.adminInstruments'), t('adm.instDesc')) + '<section class="panel"><div class="toolbar"><div class="chips">' + NX.catalog.MARKETS.map((m) => '<button class="chip ' + (st.im === m ? 'active' : '') + '" data-act="imarket" data-v="' + m + '">' + t('market.' + m) + '</button>').join('') + '</div><input class="input" id="iSearch" type="search" placeholder="' + t('term.search') + '" value="' + U.esc(st.iq) + '" aria-label="' + t('term.search') + '"></div><div id="iBody">' + ui.loading(6) + '</div></section>';
    U.$('#iSearch', el).addEventListener('input', U.debounce((e) => { st.iq = e.target.value; renderInst(); }, 150));
    U.$('#iBody', el).addEventListener('change', onInstChange);
    await renderInst();
  }
  async function renderInst() {
    const el = U.$('#iBody', root); if (!el) return;
    try {
      const [list, s] = await Promise.all([NX.api.market.instruments(), NX.api.admin.settings()]);
      const q = st.iq.trim().toLowerCase();
      const rows = list.filter((i) => i.market === st.im && (!q || (i.symbol + ' ' + i.name).toLowerCase().indexOf(q) >= 0));
      const H = [t('col.instrument'), t('col.price'), t('adm.enabled'), t('adm.spread'), t('adm.feeOverride')];
      el.innerHTML = '<div class="panel-body" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><label class="check"><input type="checkbox" data-marketon="' + st.im + '"' + (s.markets[st.im] !== false ? ' checked' : '') + '> <b>' + t('adm.marketOn', { m: t('market.' + st.im) }) + '</b></label><span class="muted" style="font-size:11px">' + t('adm.instHint') + '</span></div>' +
        (rows.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map((i) => '<tr>' +
          td(H[0], '<div class="asset">' + ui.badge(i.id, 'xs') + '<span>' + U.esc(i.symbol) + '<small>' + U.esc(i.name) + '</small></span></div>') + td(H[1], ui.fmtPrice(i.id, NX.market.price(i.id)) + ' ' + i.quote) +
          td(H[2], '<input type="checkbox" style="accent-color:#19c2ff;width:17px;height:17px" data-ien="' + U.esc(i.id) + '"' + (((s.instruments[i.id] || {}).enabled !== false) ? ' checked' : '') + ' aria-label="' + t('adm.enabled') + ' ' + U.esc(i.symbol) + '">') +
          td(H[3], '<input class="input" style="width:90px;min-height:32px;padding:5px 8px" inputmode="decimal" data-ispread="' + U.esc(i.id) + '" value="' + i.spreadBps + '" aria-label="' + t('adm.spread') + ' ' + U.esc(i.symbol) + '">') +
          td(H[4], '<input class="input" style="width:100px;min-height:32px;padding:5px 8px" inputmode="decimal" data-ifee="' + U.esc(i.id) + '" value="' + (i.feeRate != null ? U.round(i.feeRate * 100, 4) : '') + '" placeholder="' + U.fmt(s.fees[i.market].rate * 100, 3) + '%" aria-label="' + t('adm.feeOverride') + ' ' + U.esc(i.symbol) + '">') + '</tr>').join('') + '</tbody></table></div>' : ui.empty(t('search.none'), '', 'search'));
    } catch (e) { el.innerHTML = ui.error(e, 'reloadInst'); }
  }
  async function onInstChange(e) {
    const x = e.target;
    try {
      if (x.dataset.marketon) await NX.api.admin.setMarket(x.dataset.marketon, x.checked);
      else if (x.dataset.ien) await NX.api.admin.setInstrument(x.dataset.ien, { enabled: x.checked });
      else if (x.dataset.ispread) await NX.api.admin.setInstrument(x.dataset.ispread, { spreadBps: Number(x.value.replace(',', '.')) });
      else if (x.dataset.ifee) await NX.api.admin.setInstrument(x.dataset.ifee, { feeRate: x.value.trim() === '' ? null : Number(x.value.replace(',', '.')) / 100 });
      else return;
      ui.toast(t('saved'), 'info', 1500);
    } catch (err) { ui.toast(ui.errText(err), 'err'); renderInst(); }
  }

  /* ---------- Fees ---------- */
  async function fees(el) {
    el.innerHTML = head(t('nav.adminFees'), t('adm.feesDesc')) + '<div id="fBody">' + ui.loading(6) + '</div>';
    try {
      const s = await NX.api.admin.settings();
      U.$('#fBody', el).innerHTML = '<form id="feeForm" novalidate><div class="grid c2" style="align-items:start"><section class="panel"><div class="panel-title"><h3>' + t('adm.tradeFees') + '</h3></div><div class="table-wrap"><table class="dt"><thead><tr><th>' + t('col.market') + '</th><th>' + t('adm.rate') + ' %</th><th>' + t('adm.minFee') + ' USD</th></tr></thead><tbody>' +
        NX.catalog.MARKETS.map((m) => '<tr><td>' + t('market.' + m) + '</td><td><input class="input" style="width:100px;min-height:32px;padding:5px 8px" name="rate_' + m + '" inputmode="decimal" value="' + U.round(s.fees[m].rate * 100, 4) + '" aria-label="' + t('adm.rate') + ' ' + t('market.' + m) + '"></td><td><input class="input" style="width:100px;min-height:32px;padding:5px 8px" name="min_' + m + '" inputmode="decimal" value="' + s.fees[m].min + '" aria-label="' + t('adm.minFee') + ' ' + t('market.' + m) + '"></td></tr>').join('') + '</tbody></table></div></section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('adm.wdFees') + '</h3></div><div class="table-wrap"><table class="dt"><tbody>' + Object.keys(s.withdrawFees).map((k) => '<tr><td>' + k.replace(':', ' · ') + '</td><td><input class="input" style="width:120px;min-height:32px;padding:5px 8px" name="wd_' + k + '" inputmode="decimal" value="' + s.withdrawFees[k] + '" aria-label="' + k + '"></td></tr>').join('') + '</tbody></table></div>' +
        '<div class="panel-body form c2">' + ui.field({ name: 'minOrderUsd', label: t('adm.minOrder'), value: s.minOrderUsd, inputmode: 'decimal' }) + ui.field({ name: 'minDepositUsd', label: t('adm.minDeposit'), value: s.minDepositUsd, inputmode: 'decimal' }) + ui.field({ name: 'maxDepositUsd', label: t('adm.maxDeposit'), value: s.maxDepositUsd || 100000, inputmode: 'decimal' }) + ui.field({ name: 'minWithdrawUsd', label: t('adm.minWithdraw'), value: s.minWithdrawUsd, inputmode: 'decimal' }) + '</div></section></div>' +
        '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="submit">' + t('btn.save') + '</button><span class="muted" style="font-size:11px">' + t('adm.feesNote') + '</span></div></form>';
      const form = U.$('#feeForm', el);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = ui.formData(form), num = (v) => Number(String(v).replace(',', '.'));
        const f = {}; let bad = false;
        NX.catalog.MARKETS.forEach((m) => { f[m] = { rate: num(d['rate_' + m]) / 100, min: num(d['min_' + m]) }; if (!(f[m].rate >= 0 && f[m].rate <= 0.05) || !(f[m].min >= 0)) bad = true; });
        const wf = {}; Object.keys(s.withdrawFees).forEach((k) => { wf[k] = num(d['wd_' + k]); if (!(wf[k] >= 0)) bad = true; });
        const lim = { minOrderUsd: num(d.minOrderUsd), minDepositUsd: num(d.minDepositUsd), maxDepositUsd: num(d.maxDepositUsd), minWithdrawUsd: num(d.minWithdrawUsd) };
        if (!(lim.maxDepositUsd > lim.minDepositUsd)) { ui.toast(t('err.range'), 'err'); return; }
        if (Object.values(lim).some((v) => !(v >= 0))) bad = true;
        if (bad) { ui.toast(t('err.range'), 'err'); return; }
        const b = form.querySelector('[type=submit]'); ui.busy(b, true);
        try { await NX.api.admin.setFees(f, wf, lim); ui.toast(t('adm.feesSaved')); } catch (x) { ui.toast(ui.errText(x), 'err'); } finally { ui.busy(b, false); }
      });
    } catch (e) { U.$('#fBody', el).innerHTML = ui.error(e, 'reload'); }
  }

  /* ---------- Settings ---------- */
  async function settings(el) {
    el.innerHTML = head(t('nav.adminSettings'), t('adm.settingsDesc')) + '<div id="setBody">' + ui.loading(6) + '</div>';
    try {
      const s = await NX.api.admin.settings();
      U.$('#setBody', el).innerHTML = '<div class="grid c2" style="align-items:start"><section class="panel"><div class="panel-title"><h3>' + t('adm.platform') + '</h3></div><form class="panel-body form" id="setForm" novalidate>' +
        ui.field({ name: 'platformName', label: t('adm.platformName'), value: s.platformName }) + ui.field({ name: 'supportEmail', label: t('adm.supportEmail'), value: s.supportEmail, type: 'email' }) +
        ui.field({ name: 'startBalance', label: t('adm.startBalance'), value: s.startBalance, inputmode: 'decimal', hint: t('adm.startBalanceHint') }) +
        '<button class="btn primary" type="submit">' + t('btn.save') + '</button></form></section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('adm.simulation') + '</h3><span class="pill warn">' + t('demo.badge') + '</span></div><form class="panel-body form" id="simForm" novalidate>' +
        ui.field({ name: 'latencyMs', label: t('adm.latency'), value: s.latencyMs, inputmode: 'numeric', hint: t('adm.latencyHint') }) +
        ui.field({ name: 'failRate', label: t('adm.failRate'), value: U.round(s.failRate * 100, 1), inputmode: 'decimal', hint: t('adm.failRateHint') }) +
        '<div class="kv"><span>' + t('adm.clock') + '</span><b>' + (NX.market.isPaused() ? t('demo.paused') : t('demo.live')) + '</b></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">' + t('btn.save') + '</button><button class="btn" type="button" data-act="clock">' + (NX.market.isPaused() ? t('demo.resume') : t('demo.pause')) + '</button><button class="btn danger" type="button" data-act="reset">' + t('demo.reset') + '</button></div></form></section></div>' +
        '<section class="panel" style="margin-top:14px"><div class="panel-title"><h3>' + t('live.title') + '</h3></div><div class="panel-body" id="liveBox"></div></section>' +
        '<div class="notice" style="margin-top:14px">' + t('adm.settingsNote') + '</div>';
      renderLiveBox();
      const f1 = U.$('#setForm', el), f2 = U.$('#simForm', el);
      f1.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = ui.formData(f1), errs = {};
        if (!d.platformName.trim()) errs.platformName = t('err.required');
        if (!U.isEmail(d.supportEmail)) errs.supportEmail = t('err.email');
        if (!(Number(d.startBalance) >= 0)) errs.startBalance = t('err.range');
        if (!ui.setErrors(f1, errs)) return;
        try { await NX.api.admin.saveSettings({ platformName: d.platformName, supportEmail: d.supportEmail, startBalance: Number(d.startBalance) }); ui.toast(t('saved')); } catch (x) { ui.toast(ui.errText(x), 'err'); }
      });
      f2.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = ui.formData(f2);
        try { await NX.api.admin.saveSettings({ latencyMs: Number(d.latencyMs), failRate: Number(String(d.failRate).replace(',', '.')) / 100 }); ui.toast(t('saved')); } catch (x) { ui.toast(ui.errText(x), 'err'); }
      });
    } catch (e) { U.$('#setBody', el).innerHTML = ui.error(e, 'reload'); }
  }

  function renderLiveBox() {
    const el = U.$('#liveBox', root); if (!el || !NX.live) return;
    const n = NX.catalog.all().filter((i) => NX.market.isLive(i.id)).length;
    el.innerHTML = '<label class="switch-row" style="padding-top:0"><span><b>' + t('live.useLive') + '</b><p>' + t('live.useLiveText') + '</p></span><input type="checkbox" id="liveToggle" style="accent-color:#19c2ff;width:18px;height:18px"' + (NX.live.enabled() ? ' checked' : '') + (NX.live.mode === 'off' ? ' disabled' : '') + '></label>' +
      '<div class="kv"><span>' + t('live.mode') + '</span><b>' + t('live.mode.' + NX.live.mode) + '</b></div><div class="kv"><span>' + t('live.liveCount') + '</span><b>' + n + ' / ' + NX.catalog.all().length + '</b></div>' +
      '<a class="btn sm" href="#/admin/data" style="margin-top:8px">' + t('nav.adminData') + ' →</a>';
    const tg = U.$('#liveToggle', el); if (tg) tg.addEventListener('change', () => { NX.live.setEnabled(tg.checked); setTimeout(renderLiveBox, 1500); });
  }

  /* ---------- Market data sources: primary/backup chains, failover, speed & availability ---------- */
  const SECTION_LABEL = { crypto: 'market.crypto', stocks: 'market.stocks', forex: 'market.forex', metals: 'sub.metals', indices: 'market.indices', commodities: 'ds.commodities' };
  async function dataSources(el) {
    el.innerHTML = head(t('nav.adminData'), t('ds.desc'), '<button class="btn" data-act="dsRefresh">' + U.icon('reset') + t('ds.refresh') + '</button><button class="btn primary" data-act="dsBench">' + U.icon('analysis') + t('ds.bench') + '</button>') +
      '<div class="notice warn" style="margin-bottom:14px">' + t('ds.note') + '</div><div id="dsBench"></div><div id="dsBody">' + ui.loading(6) + '</div>';
    await renderSources();
    clearInterval(st.dsTimer);
    st.dsTimer = setInterval(() => { if (st && st.tab === 'data' && !root.contains(document.activeElement)) renderSources(); }, 5000);
  }
  function fmtMs(v) { return v == null ? '—' : v + ' ' + t('ds.ms'); }
  function availCls(v) { return v == null ? '' : v >= 99 ? 'up' : v >= 90 ? '' : 'down'; }
  async function renderSources() {
    const el = U.$('#dsBody', root); if (!el) return;
    if (!NX.live || NX.live.mode !== 'gateway') {
      const d = (NX.live && NX.live.direct) || {};
      const rows = Object.keys(d).map((k) => {
        const m = d[k], av = m.calls ? m.ok / m.calls * 100 : null, avg = m.lat.length ? Math.round(m.lat.reduce((x, y) => x + y, 0) / m.lat.length) : null;
        return '<tr><td>' + k + '</td><td class="r">' + m.calls + '</td><td class="r ' + availCls(av) + '">' + (av == null ? '—' : U.fmt(av, 1) + '%') + '</td><td class="r">' + fmtMs(avg) + '</td></tr>';
      }).join('');
      el.innerHTML = '<div class="notice">' + t('ds.noGateway') + '</div>' + (rows ? '<section class="panel" style="margin-top:14px"><div class="table-wrap"><table class="dt"><thead><tr><th>API</th><th class="r">' + t('ds.calls') + '</th><th class="r">' + t('ds.avail') + '</th><th class="r">' + t('ds.avg') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' : '');
      return;
    }
    try {
      const s = await NX.live.gatewayStatus();
      st.ds = s;
      el.innerHTML = Object.keys(s.sections).map((sec) => {
        const sc = s.sections[sec], stats = sc.stats;
        const rows = sc.chain.map((name, i) => {
          const p = s.providers[name], m = p.metrics;
          const state = !p.available ? '<span class="status gray">' + t('ds.noKey') + '</span>'
            : p.disabled ? '<span class="status gray">' + t('ds.off') + '</span>'
            : m.tripped ? '<span class="status bad">' + t('ds.tripped', { time: U.time(m.trippedUntil * 1000) }) + '</span>'
            : stats.lastProvider === name ? '<span class="status">' + t('ds.active') + '</span>' : '<span class="status info">' + t('ds.ready') + '</span>';
          const role = i === 0 ? '<span class="pill info">' + t('ds.primary') + '</span>' : '<span class="pill gray">' + t('ds.backupN', { n: i }) + '</span>';
          return '<tr><td data-label="">' + role + '</td>' +
            '<td data-label="API"><b>' + U.esc(p.label) + '</b>' + (p.official ? '' : ' <span class="internal-tag">' + t('live.unofficialShort') + '</span>') + '<br><small class="muted" style="white-space:normal">' + U.esc(p.note) + (p.monthCalls != null ? ' · ' + t('ds.monthCalls', { n: U.fmt(p.monthCalls, 0) }) : '') + (p.dayLimit != null ? ' · ' + t('ds.dayCredits', { n: U.fmt(p.dayUsed, 0), max: U.fmt(p.dayLimit, 0) }) : '') + '</small></td>' +
            '<td data-label="' + t('col.status') + '">' + state + '</td>' +
            '<td data-label="' + t('ds.avail') + '" class="r ' + availCls(m.availability) + '">' + (m.availability == null ? '—' : U.fmt(m.availability, 1) + '%') + '</td>' +
            '<td data-label="' + t('ds.avg') + '" class="r">' + fmtMs(m.avgMs) + '</td><td data-label="p95" class="r">' + fmtMs(m.p95Ms) + '</td>' +
            '<td data-label="' + t('ds.calls') + '" class="r">' + m.ok + ' / <span class="' + (m.fail ? 'down' : '') + '">' + m.fail + '</span></td>' +
            '<td data-label="' + t('ds.lastError') + '" style="white-space:normal;max-width:220px"><small class="muted">' + U.esc(m.lastError || '—') + '</small></td>' +
            '<td data-label="" class="r" style="white-space:nowrap"><button class="btn sm" data-act="dsUp" data-sec="' + sec + '" data-p="' + name + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="' + t('ds.up') + '" title="' + t('ds.up') + '">↑</button> ' +
            '<button class="btn sm" data-act="dsDown" data-sec="' + sec + '" data-p="' + name + '"' + (i === sc.chain.length - 1 ? ' disabled' : '') + ' aria-label="' + t('ds.down') + '" title="' + t('ds.down') + '">↓</button> ' +
            '<label class="check" style="display:inline-flex;margin-left:6px" title="' + t('ds.toggle') + '"><input type="checkbox" aria-label="' + t('ds.toggle') + ' ' + U.esc(p.label) + '" data-dstoggle="' + name + '"' + (p.disabled ? '' : ' checked') + '></label></td></tr>';
        }).join('');
        const unresolved = NX.live.unresolved[sec] || [];
        return '<section class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>' + t(SECTION_LABEL[sec]) + '</h3><small>' + t('ds.sectionStats', { req: stats.requests, served: stats.served, fb: stats.fallback, un: stats.unserved }) + '</small></div>' +
          '<div class="table-wrap"><table class="dt cards"><thead><tr><th>' + t('ds.role') + '</th><th>API</th><th>' + t('col.status') + '</th><th class="r">' + t('ds.avail') + '</th><th class="r">' + t('ds.avg') + '</th><th class="r">p95</th><th class="r">' + t('ds.calls') + '</th><th>' + t('ds.lastError') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          (unresolved.length ? '<div class="panel-body" style="padding-top:8px"><small class="muted">' + t('ds.unresolved') + ': ' + unresolved.map(U.esc).join(', ') + '</small></div>' : '') + '</section>';
      }).join('');
    } catch (e) { el.innerHTML = ui.error(e, 'dsRefresh'); }
  }
  async function moveProvider(sec, name, dir) {
    const chain = st.ds.sections[sec].chain.slice(), i = chain.indexOf(name), j = i + dir;
    if (j < 0 || j >= chain.length) return;
    chain[i] = chain[j]; chain[j] = name;
    try { await NX.live.saveChain(sec, chain); ui.toast(t('ds.saved', { p: st.ds.providers[chain[0]].label }), 'info'); renderSources(); } catch (e) { ui.toast(ui.errText(e), 'err'); }
  }
  async function runBenchmark(btn) {
    const box = U.$('#dsBench', root); ui.busy(btn, true); box.innerHTML = '<section class="panel" style="margin-bottom:14px">' + ui.loading(4) + '</section>';
    try {
      const r = await NX.live.benchmark();
      const max = Math.max(1, ...r.rows.filter((x) => x.ms).map((x) => x.ms));
      box.innerHTML = '<section class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>' + t('ds.benchTitle') + '</h3><small>' + U.dateTime(r.at) + '</small></div><div class="table-wrap"><table class="dt cards"><thead><tr><th>' + t('ds.section') + '</th><th>API</th><th>' + t('col.status') + '</th><th>' + t('ds.response') + '</th><th class="r">' + t('col.price') + '</th></tr></thead><tbody>' +
        r.rows.map((x) => '<tr><td data-label="' + t('ds.section') + '">' + t(SECTION_LABEL[x.section]) + '</td><td data-label="API"><b>' + U.esc(x.label) + '</b></td>' +
          '<td data-label="' + t('col.status') + '">' + (x.ok ? '<span class="status">OK</span>' : '<span class="status bad" title="' + U.esc(x.error || '') + '">' + U.esc((x.error || 'fail').slice(0, 40)) + '</span>') + '</td>' +
          '<td data-label="' + t('ds.response') + '">' + (x.ms != null ? '<div style="display:flex;align-items:center;gap:8px;min-width:160px"><div style="height:8px;border-radius:4px;background:' + (x.ms < 500 ? '#18d27c' : x.ms < 1500 ? '#f59e0b' : '#ff5c6c') + ';width:' + Math.max(4, x.ms / max * 140) + 'px"></div><span class="num">' + x.ms + ' ' + t('ds.ms') + '</span></div>' : '—') + '</td>' +
          '<td data-label="' + t('col.price') + '" class="r">' + (x.price != null ? U.fmtMax(x.price, 6) : '—') + '</td></tr>').join('') +
        '</tbody></table></div><div class="panel-body"><small class="muted">' + t('ds.benchNote') + '</small></div></section>';
      renderSources();
    } catch (e) { box.innerHTML = ui.error(e); } finally { ui.busy(btn, false); }
  }

  const RENDER = { staff, roles, instruments, fees, settings, data: dataSources };
  NX.views = NX.views || {};
  NX.views.admin = {
    title: (p) => t({ staff: 'nav.adminStaff', roles: 'nav.adminRoles', instruments: 'nav.adminInstruments', fees: 'nav.adminFees', settings: 'nav.adminSettings', data: 'nav.adminData' }[p.tab]),
    mount(el, params) {
      root = el; st = { tab: params.tab };
      offs.push(ui.delegate(el, {
        reload: () => RENDER[st.tab](root), reloadInst: () => renderInst(),
        addstaff: () => staffModal(), editstaff: (b) => staffModal(st.staff.find((s) => s.id === b.dataset.id)),
        imarket: (b) => { st.im = b.dataset.v; U.$$('[data-act=imarket]', root).forEach((x) => x.classList.toggle('active', x === b)); renderInst(); },
        clock: async () => { await NX.api.admin.setClock(NX.market.isPaused() ? 'resume' : 'pause'); settings(root); },
        reset: () => { const b = document.querySelector('.demo-strip [data-act=resetDemo]'); if (b) b.click(); },
        dsRefresh: async (b) => { ui.busy(b, true); await NX.live.refreshNow(); await renderSources(); ui.busy(b, false); ui.toast(t('ds.refreshed'), 'info', 1500); },
        dsBench: (b) => runBenchmark(b),
        dsUp: (b) => moveProvider(b.dataset.sec, b.dataset.p, -1),
        dsDown: (b) => moveProvider(b.dataset.sec, b.dataset.p, 1)
      }));
      // Provider on/off switch (simulate an outage to watch the failover).
      el.addEventListener('change', async (e) => {
        const name = e.target.dataset && e.target.dataset.dstoggle; if (!name || !st.ds) return;
        const dis = new Set(st.ds.disabled || []); if (e.target.checked) dis.delete(name); else dis.add(name);
        try { await NX.live.saveChain('crypto', st.ds.sections.crypto.chain, Array.from(dis)); await NX.live.refreshNow(); ui.toast(t(e.target.checked ? 'ds.enabled' : 'ds.disabled', { p: st.ds.providers[name].label }), 'info'); renderSources(); }
        catch (x) { ui.toast(ui.errText(x), 'err'); }
      });
      RENDER[params.tab](el);
    },
    unmount() { offs.forEach((f) => f()); offs = []; if (st) clearInterval(st.dsTimer); st = null; root = null; }
  };
})(window.NX);
