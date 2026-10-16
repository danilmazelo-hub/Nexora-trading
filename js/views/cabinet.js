/* NEXORA client cabinet: portfolio, wallet (simulated crypto deposit/withdrawal), history,
   notifications, support tickets, profile & settings. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store, L = NX.ledger;
  const DAY = 86400000;
  const MCOLORS = { crypto: '#19c2ff', stocks: '#8b7bff', indices: '#f5c04a', forex: '#18d27c', commodities: '#ff8a5c', cash: '#3b5975' };
  let st = null, root = null, offs = [];

  const td = (label, v, cls) => '<td data-label="' + U.esc(label) + '" class="' + (cls || '') + '">' + v + '</td>';
  const asset = (id) => '<div class="asset">' + ui.badge(id, 'xs') + '<span>' + U.esc((NX.catalog.get(id) || {}).symbol || id) + '</span></div>';
  const head = (title, desc, actions) => '<div class="heading"><div><h1>' + title + '</h1><p>' + desc + '</p></div><div class="actions">' + (actions || '') + '</div></div>';
  const card = (lbl, val, sub, cls) => '<div class="panel stat"><div class="lbl">' + lbl + '</div><div class="val ' + (cls || '') + '">' + val + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';

  /* ======================= Portfolio ======================= */
  // Equity curve rebuilt from the ledger: trades and payments replayed and valued at historical simulated prices.
  function equityCurve(trades, payments, days) {
    const now = NX.market.now(), pts = [];
    const ev = [];
    trades.forEach((x) => ev.push({ at: x.at, k: 'trade', x }));
    payments.forEach((p) => {
      if (p.type === 'deposit' && p.status === 'completed') ev.push({ at: p.completedAt, k: 'cash', v: p.amountUsd });
      if (p.type === 'demo_credit') ev.push({ at: p.createdAt, k: 'cash', v: p.amountUsd });
      if (p.type === 'withdrawal' && ['review', 'processing', 'completed'].indexOf(p.status) >= 0) ev.push({ at: p.createdAt, k: 'cash', v: -p.holdUsd });
    });
    ev.sort((a, b) => a.at - b.at);
    for (let d = days; d >= 0; d--) {
      const tt = d === 0 ? now : now - d * DAY;
      let cash = 0; const qty = {};
      ev.forEach((e) => {
        if (e.at > tt) return;
        if (e.k === 'cash') cash += e.v;
        else { const x = e.x; if (x.side === 'buy') { cash -= x.notionalUsd + x.fee; qty[x.instrumentId] = (qty[x.instrumentId] || 0) + x.qty; } else { cash += x.notionalUsd - x.fee; qty[x.instrumentId] = (qty[x.instrumentId] || 0) - x.qty; } }
      });
      let val = cash;
      Object.keys(qty).forEach((id) => { if (qty[id] > 1e-12) { const i = NX.catalog.get(id); val += NX.market.toUsd(qty[id] * NX.market.price(id, tt), i.quote, tt); } });
      pts.push({ t: tt, v: val });
    }
    return pts;
  }
  async function portfolio(el) {
    el.innerHTML = head(t('nav.portfolio'), t('pf.desc'), '<a class="btn" href="#/wallet/deposit">' + U.icon('down') + t('wallet.deposit') + '</a><a class="btn primary" href="#/trade/all">' + t('pf.trade') + '</a>') + '<div id="pfBody">' + ui.loading(6) + '</div>';
    const body = U.$('#pfBody', el);
    try {
      const me = await NX.api.me.get();
      const [acc, trades, payments] = await Promise.all([NX.api.trading.account(me.accountId), NX.api.trading.trades(me.accountId), NX.api.payments.list()]);
      st.data = { me, acc, trades, payments };
      const a = acc, curve = equityCurve(trades, payments, 30), first = curve[0].v, last = curve[curve.length - 1].v, chg = last - first;
      const byM = {}; a.positions.forEach((p) => { byM[p.market] = (byM[p.market] || 0) + p.valueUsd; });
      const parts = Object.keys(byM).map((m) => ({ k: m, v: byM[m] })).concat([{ k: 'cash', v: Math.max(0, a.cash) }]).filter((x) => x.v > 0);
      const tot = U.sum(parts, (x) => x.v) || 1;
      body.innerHTML = '<div class="grid c4" style="margin-bottom:14px">' +
        card(t('acc.equity'), U.usd(a.equity), t('pf.change30') + ' <span class="' + U.cls(chg) + '">' + U.signedUsd(chg) + '</span>') +
        card(t('acc.available'), U.usd(a.available), a.reservedCash ? t('acc.reserved') + ' ' + U.usd(a.reservedCash) : t('acc.cash') + ' ' + U.usd(a.cash)) +
        card(t('acc.openPnl'), U.signedUsd(a.unrealizedPnl), t('acc.positionsN', { n: a.positions.length }), U.cls(a.unrealizedPnl)) +
        card(t('acc.realized'), U.signedUsd(a.realizedPnl), t('pf.fees') + ' ' + U.usd(a.feesPaid), U.cls(a.realizedPnl)) + '</div>' +
        '<div class="split wide-left" style="margin-bottom:14px" id="pfRow">' +
        '<section class="panel"><div class="panel-title"><h3>' + t('pf.equityCurve') + '</h3><small>' + t('pf.last30') + '</small></div><div class="panel-body">' + ui.area(curve.map((p) => p.v), { h: 190 }) +
        '<div class="kv"><span>' + U.date(curve[0].t) + '</span><b>' + U.usd(first) + '</b></div><div class="kv"><span>' + t('pf.now') + '</span><b>' + U.usd(last) + '</b></div><p class="muted" style="font-size:11px;margin:6px 0 0">' + t('pf.curveNote') + '</p></div></section>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('pf.allocation') + '</h3></div><div class="panel-body"><div class="alloc-bar">' + parts.map((p) => '<span style="width:' + (p.v / tot * 100) + '%;background:' + MCOLORS[p.k] + '"></span>').join('') + '</div>' +
        parts.sort((x, y) => y.v - x.v).map((p) => '<div class="alloc-row"><span class="l"><i style="background:' + MCOLORS[p.k] + '"></i>' + t(p.k === 'cash' ? 'acc.cash' : 'market.' + p.k) + '</span><span><b>' + U.usd(p.v) + '</b> <span class="muted">' + U.fmt(p.v / tot * 100, 1) + '%</span></span></div>').join('') + '</div></section></div>' +
        '<section class="panel"><div class="panel-title"><h3>' + t('term.tab.positions') + '</h3><small>' + t('pf.valuedAt') + '</small></div><div id="pfPos"></div></section>';
      renderPositions();
    } catch (e) { body.innerHTML = ui.error(e, 'reload'); }
  }
  function renderPositions() {
    const el = U.$('#pfPos', root); if (!el || !st.data) return;
    const ps = st.data.acc.positions;
    if (!ps.length) { el.innerHTML = ui.empty(t('term.noPositions'), t('term.noPositionsText'), 'portfolio'); return; }
    const H = [t('col.instrument'), t('col.market'), t('col.qty'), t('col.avg'), t('col.price'), t('col.value'), t('col.pnl'), ''];
    el.innerHTML = '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + ps.map((p) => '<tr>' + td(H[0], asset(p.instrumentId)) + td(H[1], t('market.' + p.market)) + td(H[2], ui.fmtQty(p.instrumentId, p.qty)) + td(H[3], ui.fmtPrice(p.instrumentId, p.avgPrice)) + td(H[4], ui.fmtPrice(p.instrumentId, p.price)) + td(H[5], U.usd(p.valueUsd)) +
      td(H[6], '<span class="' + U.cls(p.pnlUsd) + '">' + U.signedUsd(p.pnlUsd) + ' (' + U.pct(p.pnlPct) + ')</span>') + td('', '<a class="btn sm" href="#/trade/' + p.market + '?s=' + encodeURIComponent(p.instrumentId) + '">' + t('term.open') + '</a> <a class="btn sm sell" href="#/trade/' + p.market + '?s=' + encodeURIComponent(p.instrumentId) + '&side=sell">' + t('side.sell') + '</a>') + '</tr>').join('') + '</tbody></table></div>';
  }

  /* ======================= Wallet ======================= */
  const STEPS = { deposit: ['awaiting', 'confirming', 'completed'], withdrawal: ['review', 'processing', 'completed'] };
  function steps(p) {
    const flow = STEPS[p.type] || []; const idx = flow.indexOf(p.status);
    if (idx < 0) return '<div class="wallet-steps">' + ui.status('pst', p.status) + '</div>';
    return '<div class="wallet-steps">' + flow.map((s, i) => '<span class="' + (i < idx || p.status === 'completed' ? 'done' : i === idx ? 'now' : '') + '">' + (i + 1) + '. ' + t('pst.' + s) + '</span>').join('') + '</div>';
  }
  async function wallet(el, sub) {
    sub = sub === 'withdraw' ? 'withdraw' : 'deposit';
    el.innerHTML = head(t('nav.wallet'), t('wallet.desc')) +
      '<div class="notice warn" style="margin-bottom:14px">' + U.icon('alert').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"') + ' ' + t('wallet.simNotice') + '</div>' +
      '<div class="split" id="wRow"><section class="panel"><div class="tabs" role="tablist"><button role="tab" class="' + (sub === 'deposit' ? 'active' : '') + '" aria-selected="' + (sub === 'deposit') + '" data-act="wsub" data-v="deposit">' + t('wallet.deposit') + '</button><button role="tab" class="' + (sub === 'withdraw' ? 'active' : '') + '" aria-selected="' + (sub === 'withdraw') + '" data-act="wsub" data-v="withdraw">' + t('wallet.withdraw') + '</button></div><div class="panel-body" id="wForm">' + ui.loading(5) + '</div></section>' +
      '<section class="panel"><div class="panel-title"><h3>' + t('wallet.requests') + '</h3><small>' + t('wallet.liveStatus') + '</small></div><div id="wList">' + ui.loading(4) + '</div></section></div>';
    st.wsub = sub;
    try {
      const me = await NX.api.me.get();
      const [acc, fees] = await Promise.all([NX.api.trading.account(me.accountId), NX.api.market.fees()]);
      st.data = { me, acc, fees };
      renderWalletForm(); await renderWalletList();
    } catch (e) { U.$('#wForm', el).innerHTML = ui.error(e, 'reload'); }
  }
  function assetOptions(sel) { return Object.keys(L.WALLET_ASSETS).map((a) => [a, a]).map((o) => '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>').join(''); }
  function netOptions(a, sel) { return L.WALLET_ASSETS[a].networks.map((n) => '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + '</option>').join(''); }
  function renderWalletForm() {
    const el = U.$('#wForm', root); if (!el) return;
    const { me, acc, fees } = st.data;
    const w = st.w = st.w || { asset: 'USDT', network: 'TRC20' };
    if (st.wsub === 'deposit') {
      el.innerHTML = '<form class="form" id="depForm" novalidate>' +
        '<div class="form c2"><div class="field" data-field="asset"><label for="dAsset">' + t('wallet.asset') + '</label><select id="dAsset" name="asset">' + assetOptions(w.asset) + '</select></div><div class="field" data-field="network"><label for="dNet">' + t('wallet.network') + '</label><select id="dNet" name="network">' + netOptions(w.asset, w.network) + '</select></div></div>' +
        ui.field({ name: 'amount', label: t('wallet.amount') + ' (' + w.asset + ')', inputmode: 'decimal', placeholder: '0.00', hint: t('wallet.depositRange', { min: U.usd(fees.minDepositUsd, 0), max: U.usd(fees.maxDepositUsd, 0) }) }) +
        '<div class="kv"><span>' + t('wallet.approxUsd') + '</span><b id="dUsd">—</b></div>' +
        '<div class="notice">' + t('wallet.noAddress') + '</div>' +
        '<button class="btn primary block" type="submit">' + t('wallet.createDeposit') + '</button></form>';
    } else {
      const kyc = me.kyc === 'verified';
      const fee = fees.withdrawFees[w.asset + ':' + w.network] || 0;
      el.innerHTML = (kyc ? '' : '<div class="notice warn" style="margin-bottom:12px">' + t('wallet.kycNeeded') + ' <a href="#/profile/verification">' + t('wallet.kycGo') + '</a></div>') +
        '<form class="form" id="wdForm" novalidate>' +
        '<div class="form c2"><div class="field" data-field="asset"><label for="wAsset">' + t('wallet.asset') + '</label><select id="wAsset" name="asset">' + assetOptions(w.asset) + '</select></div><div class="field" data-field="network"><label for="wNet">' + t('wallet.network') + '</label><select id="wNet" name="network">' + netOptions(w.asset, w.network) + '</select></div></div>' +
        ui.field({ name: 'address', label: t('wallet.address'), placeholder: w.network === 'BTC' ? 'bc1…' : w.network === 'TRC20' ? 'T…' : '0x…', hint: t('wallet.addressHint.' + w.network), autocomplete: 'off' }) +
        ui.field({ name: 'amount', label: t('wallet.amount') + ' (' + w.asset + ')', inputmode: 'decimal', placeholder: '0.00' }) +
        '<div class="quick">' + [25, 50, 75, 100].map((p) => '<button type="button" data-act="wpct" data-v="' + p + '">' + p + '%</button>').join('') + '</div>' +
        '<div id="wCalc"></div>' +
        '<label class="check"><input type="checkbox" name="ack"> <span>' + t('wallet.ack') + '</span></label>' +
        '<button class="btn primary block" type="submit"' + (kyc ? '' : ' disabled') + '>' + t('wallet.createWithdraw') + '</button></form>';
      st.wfee = fee;
      calcWithdraw();
    }
    const form = el.querySelector('form');
    form.addEventListener('change', (e) => {
      if (e.target.name === 'asset') { w.asset = e.target.value; w.network = L.WALLET_ASSETS[w.asset].networks[0]; renderWalletForm(); }
      else if (e.target.name === 'network') { w.network = e.target.value; renderWalletForm(); }
    });
    form.addEventListener('input', () => { if (st.wsub === 'deposit') { const v = Number((form.amount.value || '').replace(',', '.')); U.$('#dUsd', root).textContent = v > 0 ? '≈ ' + U.usd(v * L.assetUsd(w.asset)) : '—'; } else calcWithdraw(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); st.wsub === 'deposit' ? submitDeposit(form) : submitWithdraw(form); });
  }
  function calcWithdraw() {
    const el = U.$('#wCalc', root), form = U.$('#wdForm', root); if (!el || !form) return;
    const w = st.w, px = L.assetUsd(w.asset), amt = Number((form.amount.value || '').replace(',', '.')) || 0, fee = st.wfee;
    const total = (amt + fee) * px, avail = st.data.acc.available;
    el.innerHTML = '<div class="kv"><span>' + t('wallet.networkFee') + '</span><b>' + U.fmtMax(fee, 6) + ' ' + w.asset + '</b></div><div class="kv"><span>' + t('wallet.recipientGets') + '</span><b>' + U.fmtMax(amt, 8) + ' ' + w.asset + '</b></div>' +
      '<div class="kv total"><span>' + t('wallet.debit') + '</span><b class="' + (total > avail ? 'down' : '') + '">' + U.usd(total) + '</b></div><div class="kv"><span>' + t('acc.available') + '</span><b>' + U.usd(avail) + '</b></div>';
  }
  async function submitDeposit(form) {
    const d = ui.formData(form), amt = Number(String(d.amount).replace(',', '.')), errs = {};
    if (!(amt > 0)) errs.amount = t('err.amount');
    else if (amt * L.assetUsd(d.asset) < st.data.fees.minDepositUsd) errs.amount = t('err.minDeposit', { min: U.fmt(st.data.fees.minDepositUsd, 0) });
    else if (amt * L.assetUsd(d.asset) > st.data.fees.maxDepositUsd) errs.amount = t('err.maxDeposit', { max: U.fmt(st.data.fees.maxDepositUsd, 0) });
    if (!ui.setErrors(form, errs)) return;
    const btn = form.querySelector('[type=submit]'); ui.busy(btn, true);
    try { const p = await NX.api.payments.createDeposit({ asset: d.asset, network: d.network, amount: amt }); ui.toast(t('wallet.depCreated', { id: p.id }), 'info'); form.reset(); U.$('#dUsd', root).textContent = '—'; await renderWalletList(); }
    catch (e) { ui.toast(ui.errText(e), 'err'); }
    finally { ui.busy(btn, false); }
  }
  async function submitWithdraw(form) {
    const d = ui.formData(form), amt = Number(String(d.amount).replace(',', '.')), errs = {};
    if (!L.ADDRESS_RULES[d.network].test(String(d.address).trim())) errs.address = t('err.address');
    if (!(amt > 0)) errs.amount = t('err.amount');
    else if ((amt + st.wfee) * L.assetUsd(d.asset) > st.data.acc.available) errs.amount = t('err.funds');
    else if (amt * L.assetUsd(d.asset) < st.data.fees.minWithdrawUsd) errs.amount = t('err.minWithdraw', { min: st.data.fees.minWithdrawUsd });
    if (!form.ack.checked) { ui.toast(t('wallet.ackNeeded'), 'warn'); if (!Object.keys(errs).length) return; }
    if (!ui.setErrors(form, errs)) return;
    const btn = form.querySelector('[type=submit]'); ui.busy(btn, true);
    try {
      const p = await NX.api.payments.createWithdrawal({ asset: d.asset, network: d.network, address: d.address, amount: amt });
      ui.toast(t('wallet.wdCreated', { id: p.id }), 'info', 6000);
      form.reset(); // the full address is not kept anywhere
      st.data.acc = await NX.api.trading.account(st.data.me.accountId); calcWithdraw(); await renderWalletList();
    } catch (e) { const m = ui.errText(e); if (e.code === 'err.address') ui.setErrors(form, { address: m }); else ui.toast(m, 'err'); }
    finally { ui.busy(btn, false); }
  }
  async function renderWalletList() {
    const el = U.$('#wList', root); if (!el) return;
    try {
      const list = (await NX.api.payments.list()).filter((p) => p.type === 'deposit' || p.type === 'withdrawal').slice(0, 12);
      if (!list.length) { el.innerHTML = ui.empty(t('wallet.noRequests'), '', 'wallet'); return; }
      el.innerHTML = list.map((p) => '<div style="padding:12px 14px;border-bottom:1px solid #162b3e"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>' + t('ptype.' + p.type) + ' · ' + U.fmtMax(p.amount, 8) + ' ' + p.asset + ' <span class="muted" style="font-weight:400">' + p.network + '</span></b>' + ui.status('pst', p.status) + '</div>' +
        '<div class="muted" style="font-size:11px;margin:4px 0">' + U.esc(p.id) + ' · ' + U.dateTime(p.createdAt) + ' · ≈ ' + U.usd(p.amountUsd) + (p.address ? ' · ' + t('wallet.to') + ' ' + U.esc(p.address) : '') + ' · ' + t('wallet.simRef') + ' ' + U.esc(p.ref) + '</div>' + steps(p) +
        (p.type === 'deposit' && p.status === 'awaiting' ? '<div class="demo-address" style="margin:6px 0">' + t('wallet.demoAddress') + '</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm primary" data-act="arrive" data-id="' + p.id + '">' + t('wallet.simulateArrival') + '</button><button class="btn sm" data-act="pcancel" data-id="' + p.id + '">' + t('btn.cancel') + '</button></div>' : '') +
        (p.type === 'deposit' && p.status === 'confirming' ? '<div class="muted" style="font-size:11px">' + t('wallet.confirmingText') + '</div>' : '') +
        (p.type === 'withdrawal' && p.status === 'review' ? '<div class="muted" style="font-size:11px;margin-bottom:6px">' + t('wallet.reviewText') + '</div><button class="btn sm" data-act="pcancel" data-id="' + p.id + '">' + t('wallet.cancelRequest') + '</button>' : '') +
        (p.status === 'rejected' && p.reason ? '<div class="notice err" style="margin-top:6px">' + U.esc(p.reason) + '</div>' : '') +
        (p.status === 'expired' ? '<div class="notice" style="margin-top:6px">' + t('wallet.expiredText') + '</div>' : '') + '</div>').join('');
    } catch (e) { el.innerHTML = ui.error(e, 'reloadList'); }
  }

  /* ======================= History ======================= */
  async function historyView(el, sub) {
    sub = ['trades', 'orders', 'payments'].indexOf(sub) >= 0 ? sub : 'trades';
    st.hsub = sub; st.hq = st.hq || '';
    el.innerHTML = head(t('nav.history'), t('hist.desc')) + '<section class="panel"><div class="tabs" role="tablist">' + ['trades', 'orders', 'payments'].map((k) => '<button role="tab" data-act="hsub" data-v="' + k + '" class="' + (sub === k ? 'active' : '') + '" aria-selected="' + (sub === k) + '">' + t('hist.' + k) + '</button>').join('') + '</div>' +
      '<div class="toolbar"><input class="input" id="hSearch" type="search" placeholder="' + t('hist.search') + '" value="' + U.esc(st.hq) + '" aria-label="' + t('hist.search') + '"><select class="input" id="hType" aria-label="' + t('hist.filter') + '">' + (sub === 'payments' ? ['all', 'deposit', 'withdrawal', 'demo_credit'] : ['all', 'buy', 'sell']).map((v) => '<option value="' + v + '">' + t(v === 'all' ? 'hist.all' : sub === 'payments' ? 'ptype.' + v : 'side.' + v) + '</option>').join('') + '</select><span class="muted" id="hCount"></span></div><div id="hBody">' + ui.loading(5) + '</div></section>';
    try {
      const me = await NX.api.me.get();
      st.data = { me, trades: await NX.api.trading.trades(me.accountId), orders: await NX.api.trading.orders(me.accountId), payments: await NX.api.payments.list() };
      U.$('#hSearch', el).addEventListener('input', U.debounce((e) => { st.hq = e.target.value; renderHistory(); }, 120));
      U.$('#hType', el).addEventListener('change', renderHistory);
      renderHistory();
    } catch (e) { U.$('#hBody', el).innerHTML = ui.error(e, 'reload'); }
  }
  function renderHistory() {
    const el = U.$('#hBody', root); if (!el || !st.data) return;
    const q = st.hq.trim().toLowerCase(), ty = U.$('#hType', root).value;
    let list, H, rows;
    if (st.hsub === 'payments') {
      list = st.data.payments.filter((p) => (ty === 'all' || p.type === ty) && (!q || (p.id + ' ' + p.asset + ' ' + p.network + ' ' + p.status).toLowerCase().indexOf(q) >= 0));
      H = [t('col.time'), t('col.id'), t('col.type'), t('col.amount'), t('col.usd'), t('col.status')];
      rows = list.map((p) => '<tr>' + td(H[0], U.dateTime(p.createdAt)) + td(H[1], U.esc(p.id)) + td(H[2], t('ptype.' + p.type)) + td(H[3], U.fmtMax(p.amount, 8) + ' ' + p.asset + (p.network && p.network !== '—' ? ' <span class="muted">' + p.network + '</span>' : '')) + td(H[4], U.usd(p.amountUsd)) + td(H[5], ui.status('pst', p.status)) + '</tr>');
    } else if (st.hsub === 'orders') {
      list = st.data.orders.filter((o) => (ty === 'all' || o.side === ty) && (!q || (o.instrumentId + ' ' + o.id).toLowerCase().indexOf(q) >= 0));
      H = [t('col.time'), t('col.id'), t('col.instrument'), t('col.side'), t('col.type'), t('col.qty'), t('col.price'), t('col.status')];
      rows = list.map((o) => '<tr>' + td(H[0], U.dateTime(o.createdAt)) + td(H[1], U.esc(o.id)) + td(H[2], asset(o.instrumentId)) + td(H[3], ui.side(o.side)) + td(H[4], t('order.' + o.type)) + td(H[5], ui.fmtQty(o.instrumentId, o.qty)) + td(H[6], o.fillPrice ? ui.fmtPrice(o.instrumentId, o.fillPrice) : o.limitPrice ? ui.fmtPrice(o.instrumentId, o.limitPrice) : '—') + td(H[7], ui.status('ost', o.status)) + '</tr>');
    } else {
      list = st.data.trades.filter((x) => (ty === 'all' || x.side === ty) && (!q || (x.instrumentId + ' ' + x.id).toLowerCase().indexOf(q) >= 0));
      H = [t('col.time'), t('col.id'), t('col.instrument'), t('col.side'), t('col.qty'), t('col.price'), t('col.notional'), t('col.fee'), t('col.realized')];
      rows = list.map((x) => '<tr>' + td(H[0], U.dateTime(x.at)) + td(H[1], U.esc(x.id)) + td(H[2], asset(x.instrumentId)) + td(H[3], ui.side(x.side)) + td(H[4], ui.fmtQty(x.instrumentId, x.qty)) + td(H[5], ui.fmtPrice(x.instrumentId, x.price) + ' ' + x.quoteCcy) + td(H[6], U.usd(x.notionalUsd)) + td(H[7], U.usd(x.fee)) + td(H[8], x.realizedPnl == null ? '—' : '<span class="' + U.cls(x.realizedPnl) + '">' + U.signedUsd(x.realizedPnl) + '</span>') + '</tr>');
    }
    U.$('#hCount', root).textContent = t('hist.count', { n: list.length });
    el.innerHTML = list.length ? '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : (q ? ui.empty(t('search.none'), t('search.noneText', { q: st.hq }), 'search') : ui.empty(t('hist.empty'), '', 'history'));
  }

  /* ======================= Notifications ======================= */
  const NICON = { trade: 'swap', payment: 'wallet', support: 'support', account: 'user', system: 'info' };
  async function notifications(el) {
    st.nf = st.nf || 'all';
    el.innerHTML = head(t('nav.notifications'), t('nf.desc'), '<button class="btn" data-act="readall">' + U.icon('check') + t('nf.readAll') + '</button>') +
      '<div class="split side-right" id="nRow"><section class="panel"><div class="toolbar"><div class="chips">' + ['all', 'unread', 'trade', 'payment', 'support', 'account'].map((k) => '<button class="chip ' + (st.nf === k ? 'active' : '') + '" data-act="nfilter" data-v="' + k + '">' + t('nf.f.' + k) + '</button>').join('') + '</div></div><div id="nList">' + ui.loading(5) + '</div></section>' +
      '<section class="panel"><div class="panel-title"><h3>' + t('nf.settings') + '</h3></div><div class="panel-body">' + ['trades', 'payments', 'support', 'marketing'].map((k) => '<label class="switch-row"><span><b>' + t('nf.set.' + k) + '</b><p>' + t('nf.set.' + k + '.d') + '</p></span><input type="checkbox" class="check" data-nset="' + k + '"' + (S.state.notifSettings[k] ? ' checked' : '') + ' style="accent-color:#19c2ff;width:18px;height:18px"></label>').join('') + '<p class="muted" style="font-size:11px">' + t('nf.localNote') + '</p></div></section></div>';
    el.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.nset; if (k) { const s = Object.assign({}, S.state.notifSettings); s[k] = e.target.checked; S.set('notifSettings', s); ui.toast(t('saved'), 'info', 1500); } });
    await renderNotifs();
  }
  async function renderNotifs() {
    const el = U.$('#nList', root); if (!el) return;
    try {
      let list = await NX.api.notifications.list();
      if (st.nf === 'unread') list = list.filter((n) => !n.read); else if (st.nf !== 'all') list = list.filter((n) => n.kind === st.nf);
      el.innerHTML = list.length ? list.map((n) => '<div class="notif ' + (n.read ? '' : 'unread') + '"><span class="ic">' + U.icon(NICON[n.kind] || 'info') + '</span><div style="flex:1;min-width:0"><b>' + t(n.key + '.t', notifVars(n)) + '</b><p>' + t(n.key, notifVars(n)) + '</p><small>' + U.dateTime(n.at) + ' · ' + U.ago(n.at) + '</small></div>' + (n.read ? '' : '<button class="btn sm" data-act="readone" data-id="' + n.id + '">' + t('nf.markRead') + '</button>') + '</div>').join('') : ui.empty(t('nf.empty'), '', 'bell');
    } catch (e) { el.innerHTML = ui.error(e, 'reloadNotifs'); }
  }
  function notifVars(n) { const v = Object.assign({}, n.vars); if (v.side) v.side = t('side.' + v.side); if (v.kyc) v.kyc = t('kyc.' + v.kyc); return v; }

  /* ======================= Support ======================= */
  async function support(el) {
    el.innerHTML = head(t('nav.support'), t('sup.desc'), '<button class="btn primary" data-act="newticket">' + U.icon('plus') + t('sup.new') + '</button>') +
      '<div class="split side-left" id="sRow"><section class="panel"><div class="panel-title"><h3>' + t('sup.tickets') + '</h3></div><div id="sList">' + ui.loading(4) + '</div></section><section class="panel" id="sThread">' + ui.empty(t('sup.pick'), t('sup.pickText'), 'support') + '</section></div>';
    await renderTickets();
  }
  async function renderTickets() {
    const el = U.$('#sList', root); if (!el) return;
    try {
      const list = await NX.api.support.list(); st.tickets = list;
      el.innerHTML = list.length ? list.map((tk) => '<button class="mover" style="grid-template-columns:minmax(0,1fr) auto" data-act="ticket" data-id="' + tk.id + '"><span><b>' + U.esc(ui.txt(tk.subject)) + '</b><small>' + tk.id + ' · ' + t('tcat.' + tk.category) + ' · ' + U.ago(tk.updatedAt) + '</small></span>' + ui.status('tst', tk.status) + '</button>').join('') : ui.empty(t('sup.none'), t('sup.noneText'), 'support');
      if (st.ticketId) renderThread(st.ticketId);
    } catch (e) { el.innerHTML = ui.error(e, 'reloadTickets'); }
  }
  function renderThread(id) {
    const el = U.$('#sThread', root), tk = (st.tickets || []).find((x) => x.id === id); if (!el || !tk) return;
    st.ticketId = id;
    el.innerHTML = '<div class="panel-title"><div><h3>' + U.esc(ui.txt(tk.subject)) + '</h3><small>' + tk.id + ' · ' + t('tcat.' + tk.category) + ' · ' + U.dateTime(tk.createdAt) + '</small></div>' + ui.status('tst', tk.status) + '</div>' +
      '<div class="thread">' + tk.messages.map((m) => '<div class="bubble ' + (m.author === 'client' ? 'mine' : '') + '"><small>' + (m.author === 'client' ? t('sup.you') : t('sup.staff')) + ' · ' + U.dateTime(m.at) + '</small>' + U.esc(ui.txt(m.text)) + '</div>').join('') + '</div>' +
      '<form class="reply" id="replyForm"><label class="sr-only" for="replyText">' + t('sup.reply') + '</label><input class="input" id="replyText" name="text" placeholder="' + t('sup.replyPh') + '" maxlength="2000" autocomplete="off"><button class="btn primary" type="submit">' + t('btn.send') + '</button></form>';
    const th = el.querySelector('.thread'); th.scrollTop = th.scrollHeight;
    el.querySelector('#replyForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const inp = e.target.text, btn = e.target.querySelector('button');
      if (!inp.value.trim()) { inp.focus(); return; }
      ui.busy(btn, true);
      try { await NX.api.support.reply(id, inp.value); inp.value = ''; await renderTickets(); } catch (x) { ui.toast(ui.errText(x), 'err'); } finally { ui.busy(btn, false); }
    });
  }
  function newTicket() {
    const m = ui.modal({ title: t('sup.new'), body: '<form class="form" id="tkForm" novalidate>' + ui.field({ name: 'subject', label: t('sup.subject'), required: true }) +
      ui.field({ name: 'category', label: t('sup.category'), type: 'select', value: 'trading', options: ['trading', 'payments', 'kyc', 'technical', 'other'].map((c) => [c, t('tcat.' + c)]) }) +
      ui.field({ name: 'text', label: t('sup.message'), type: 'textarea', required: true }) + '<p class="muted" style="font-size:11px;margin:0">' + t('sup.noSensitive') + '</p></form>',
    footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn primary" id="tkSend">' + t('btn.send') + '</button>' });
    const form = m.el.querySelector('#tkForm');
    m.el.querySelector('#tkSend').onclick = async (e) => {
      const d = ui.formData(form), errs = {};
      if ((d.subject || '').trim().length < 3) errs.subject = t('err.subject');
      if ((d.text || '').trim().length < 3) errs.text = t('err.message');
      if (!ui.setErrors(form, errs)) return;
      ui.busy(e.target, true);
      try { const tk = await NX.api.support.create(d); m.close(); ui.toast(t('sup.created', { id: tk.id }), 'info'); st.ticketId = tk.id; await renderTickets(); }
      catch (x) { ui.busy(e.target, false); ui.toast(ui.errText(x), 'err'); }
    };
  }

  /* ======================= Profile & settings ======================= */
  async function profile(el, sub) {
    sub = ['personal', 'verification', 'security', 'preferences', 'demo'].indexOf(sub) >= 0 ? sub : 'personal';
    el.innerHTML = head(t('nav.profile'), t('prof.desc')) + '<section class="panel"><div class="tabs" role="tablist">' + ['personal', 'verification', 'security', 'preferences', 'demo'].map((k) => '<button role="tab" data-act="psub" data-v="' + k + '" class="' + (sub === k ? 'active' : '') + '" aria-selected="' + (sub === k) + '">' + t('prof.' + k) + '</button>').join('') + '</div><div class="panel-body" id="pBody" style="max-width:860px">' + ui.loading(5) + '</div></section>';
    st.psub = sub;
    try { st.me = await NX.api.me.get(); renderProfile(); } catch (e) { U.$('#pBody', el).innerHTML = ui.error(e, 'reload'); }
  }
  function renderProfile() {
    const el = U.$('#pBody', root), me = st.me; if (!el) return;
    if (st.psub === 'personal') {
      el.innerHTML = '<div class="grid c2" style="align-items:start"><form class="form" id="profForm" novalidate>' + ui.field({ name: 'name', label: t('f.fullName'), value: me.name, autocomplete: 'name', required: true }) +
        '<div class="field"><label for="f_email">' + t('f.email') + '</label><input id="f_email" class="input" value="' + U.esc(me.email) + '" disabled><span class="hint">' + t('prof.emailHint') + '</span></div>' +
        ui.field({ name: 'phone', label: t('f.phone'), value: me.phone, type: 'tel', autocomplete: 'tel' }) +
        ui.field({ name: 'country', label: t('f.country'), type: 'select', value: me.country, options: ['UA', 'PL', 'DE', 'CZ', 'LT', 'LV', 'EE', 'ES', 'IT', 'GB', 'CY', 'AE', 'KZ', 'GE', 'MD'].map((c) => [c, c]) }) +
        '<button class="btn primary" type="submit">' + t('btn.save') + '</button></form>' +
        '<div class="panel" style="padding:16px"><h3 style="margin:0 0 10px;font-size:14px">' + t('prof.manager') + '</h3>' + (me.manager ? '<div style="display:flex;gap:10px;align-items:center"><span class="avatar">' + U.esc(U.initials(me.manager.name)) + '</span><div><b>' + U.esc(me.manager.name) + '</b><div class="muted" style="font-size:11px">' + U.esc(me.manager.email) + ' · ' + U.esc(me.manager.phone) + '</div></div></div><p class="muted" style="font-size:11px;margin:10px 0 0">' + t('prof.managerNote') + '</p>' : '<p class="muted">' + t('prof.noManager') + '</p>') +
        '<hr class="sep"><div class="kv"><span>' + t('prof.clientId') + '</span><b>' + U.esc(me.id) + '</b></div><div class="kv"><span>' + t('prof.account') + '</span><b>' + U.esc(me.accountId || '—') + '</b></div><div class="kv"><span>' + t('prof.since') + '</span><b>' + U.date(me.createdAt) + '</b></div><div class="kv"><span>KYC</span><b>' + ui.status('kyc', me.kyc) + '</b></div></div></div>';
      const form = U.$('#profForm', el);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = ui.formData(form);
        if (!ui.setErrors(form, (d.name || '').trim().length < 2 ? { name: t('err.name') } : {})) return;
        const btn = form.querySelector('[type=submit]'); ui.busy(btn, true);
        // Nothing changed → say so instead of a misleading "saved".
        if (d.name.trim() === st.me.name && (d.phone || '').trim() === (st.me.phone || '') && d.country === st.me.country) { ui.busy(btn, false); ui.toast(t('prof.noChanges'), 'info'); return; }
        try { st.me = await NX.api.me.update({ name: d.name, phone: d.phone, country: d.country }); ui.toast(t('prof.saved')); NX.app.reloadWho(); } catch (x) { ui.toast(ui.errText(x), 'err'); } finally { ui.busy(btn, false); }
      });
    } else if (st.psub === 'verification') {
      const pct = { none: 25, pending: 70, verified: 100, rejected: 40 }[me.kyc] || 25;
      el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">' + t('kyc.title') + '</h3>' + ui.status('kyc', me.kyc) + '</div>' +
        '<div class="meter" style="height:9px;margin:14px 0"><span style="width:' + pct + '%;background:linear-gradient(90deg,#19c2ff,#18d27c)"></span></div>' +
        '<div class="notice" style="margin-bottom:12px">' + t('kyc.demoNote') + '</div>' +
        (me.kyc === 'verified' ? '<div class="notice ok">' + t('kyc.verifiedText') + '</div>' : me.kyc === 'pending' ? '<div class="notice warn">' + t('kyc.pendingText') + '</div>' :
          '<form class="form" id="kycForm"><div class="field"><label for="kycDoc">' + t('kyc.doc') + '</label><input id="kycDoc" type="file" accept="image/*,.pdf" class="input"><span class="hint">' + t('kyc.docHint') + '</span></div><label class="check"><input type="checkbox" name="ok"> <span>' + t('kyc.confirm') + '</span></label><button class="btn primary" type="submit">' + t('kyc.submit') + '</button></form>');
      const f = U.$('#kycForm', el);
      if (f) f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!f.ok.checked) { ui.toast(t('kyc.confirmNeeded'), 'warn'); return; }
        const file = U.$('#kycDoc', f); file.value = ''; // the selected file is discarded immediately
        try { st.me = await NX.api.me.submitKyc(); ui.toast(t('kyc.submitted'), 'info'); renderProfile(); } catch (x) { ui.toast(ui.errText(x), 'err'); }
      });
    } else if (st.psub === 'security') {
      el.innerHTML = '<div class="grid c2" style="align-items:start"><form class="form" id="pwForm" novalidate autocomplete="off"><h3 style="margin:0">' + t('sec.changePw') + '</h3>' +
        ui.field({ name: 'current', label: t('sec.current'), type: 'password', autocomplete: 'current-password' }) + ui.field({ name: 'next', label: t('sec.new'), type: 'password', autocomplete: 'new-password' }) + ui.field({ name: 'confirm', label: t('f.confirm'), type: 'password', autocomplete: 'new-password' }) +
        '<button class="btn primary" type="submit">' + t('sec.update') + '</button><p class="muted" style="font-size:11px;margin:0">' + t('sec.pwNote') + '</p></form>' +
        '<div><div class="switch-row"><span><b>' + t('sec.2fa') + '</b><p>' + t('sec.2faText') + '</p></span><button class="btn sm" data-act="twofa">' + t('sec.enable') + '</button></div><div class="switch-row"><span><b>' + t('sec.sessions') + '</b><p>' + t('sec.sessionsText') + '</p></span><span class="pill gray">' + t('sec.thisDevice') + '</span></div></div></div>';
      const f = U.$('#pwForm', el);
      f.addEventListener('submit', (e) => {
        e.preventDefault(); const d = ui.formData(f), errs = {};
        if ((d.current || '').length < 8) errs.current = t('err.passwordShort');
        if ((d.next || '').length < 8) errs.next = t('err.passwordShort');
        if (d.next !== d.confirm) errs.confirm = t('err.passwordMatch');
        U.$$('input', f).forEach((i) => { i.value = ''; });
        if (!ui.setErrors(f, errs)) return;
        ui.toast(t('sec.pwDemo'), 'info', 6000);
      });
    } else if (st.psub === 'preferences') {
      el.innerHTML = '<div class="form" style="max-width:420px">' + ui.field({ name: 'lang', label: t('lang.label'), type: 'select', value: NX.i18n.lang, options: NX.i18n.langs.map((l) => [l, t('lang.' + l)]) }) +
        '<div class="kv"><span>' + t('prefs.tz') + '</span><b>' + U.esc(Intl.DateTimeFormat().resolvedOptions().timeZone || '—') + '</b></div><div class="kv"><span>' + t('prefs.ccy') + '</span><b>USD</b></div><p class="muted" style="font-size:11px">' + t('prefs.note') + '</p></div>';
      U.$('#f_lang', el).addEventListener('change', async (e) => { NX.i18n.set(e.target.value); S.set('lang', e.target.value); try { await NX.api.me.update({ language: e.target.value }); } catch (x) { /* ignore */ } location.reload(); });
    } else {
      el.innerHTML = '<h3 style="margin-top:0">' + t('demo.dataTitle') + '</h3><div class="notice" style="margin-bottom:12px">' + t('demo.dataText') + '</div>' +
        '<div class="kv"><span>' + t('demo.storage') + '</span><b>' + (NX.storage.available ? t('demo.storageLocal') : t('demo.storageMemory')) + '</b></div><div class="kv"><span>' + t('demo.sync') + '</span><b>' + t('demo.syncNo') + '</b></div>' +
        '<button class="btn danger" data-act="resetdemo" style="margin-top:12px">' + U.icon('reset') + t('demo.reset') + '</button>';
    }
  }

  /* ======================= View ======================= */
  const RENDER = { portfolio, wallet, history: historyView, notifications, support, profile };
  function show(tab, params) {
    st.tab = tab; st.params = params;
    RENDER[tab](root, params.sub);
  }
  const handlers = {
    reload: () => show(st.tab, st.params),
    wsub: (b) => NX.go('/wallet/' + b.dataset.v),
    hsub: (b) => NX.go('/history/' + b.dataset.v),
    psub: (b) => NX.go('/profile/' + b.dataset.v),
    wpct: (b) => {
      const f = U.$('#wdForm', root), px = L.assetUsd(st.w.asset), avail = st.data.acc.available;
      const amt = Math.max(0, avail * Number(b.dataset.v) / 100 / px - st.wfee);
      f.amount.value = U.round(amt, L.WALLET_ASSETS[st.w.asset].decimals); calcWithdraw();
    },
    arrive: async (b) => { ui.busy(b, true); try { await NX.api.payments.simulateArrival(b.dataset.id); ui.toast(t('wallet.arriving'), 'info'); await renderWalletList(); } catch (e) { ui.toast(ui.errText(e), 'err'); ui.busy(b, false); } },
    pcancel: async (b) => { ui.busy(b, true); try { await NX.api.payments.cancel(b.dataset.id); ui.toast(t('wallet.cancelled'), 'info'); st.data.acc = await NX.api.trading.account(st.data.me.accountId); if (st.wsub === 'withdraw') calcWithdraw(); await renderWalletList(); } catch (e) { ui.toast(ui.errText(e), 'err'); ui.busy(b, false); } },
    reloadList: () => renderWalletList(),
    readall: async () => { await NX.api.notifications.markRead(null); ui.toast(t('nf.allRead'), 'info', 1500); renderNotifs(); },
    readone: async (b) => { await NX.api.notifications.markRead([b.dataset.id]); renderNotifs(); },
    nfilter: (b) => { st.nf = b.dataset.v; U.$$('[data-act=nfilter]', root).forEach((x) => x.classList.toggle('active', x === b)); renderNotifs(); },
    reloadNotifs: () => renderNotifs(),
    newticket: () => newTicket(),
    ticket: (b) => { renderThread(b.dataset.id); const th = U.$('#sThread', root); if (window.innerWidth < 1020) th.scrollIntoView({ behavior: 'smooth' }); },
    reloadTickets: () => renderTickets(),
    twofa: () => ui.toast(t('sec.2faDemo'), 'info', 5000),
    resetdemo: () => { const b = document.querySelector('.demo-strip [data-act=resetDemo]'); if (b) b.click(); }
  };

  // Live refresh: data changed by CRM (another tab), by matching/payments, or by market ticks.
  function onDbChange() {
    if (!st) return;
    if (st.tab === 'wallet') { renderWalletList(); NX.api.trading.account(st.data && st.data.me ? st.data.me.accountId : null).then((a) => { if (st && st.data) { st.data.acc = a; if (st.wsub === 'withdraw') calcWithdraw(); } }).catch(() => {}); }
    if (st.tab === 'notifications') renderNotifs();
    if (st.tab === 'support') renderTickets();
    if (st.tab === 'portfolio' || (st.tab === 'profile' && !root.contains(document.activeElement))) show(st.tab, st.params);
    if (st.tab === 'history') historyView(root, st.hsub);
  }

  NX.views = NX.views || {};
  NX.views.cabinet = {
    title: (p) => t('nav.' + p.tab),
    mount(el, params) {
      root = el; st = { tickets: [] };
      offs.push(ui.delegate(el, handlers));
      offs.push(NX.bus.on('db:change', U.debounce(onDbChange, 150)));
      offs.push(NX.api.market.subscribe(() => {
        if (st && st.tab === 'portfolio' && st.data && st.data.me) { st.data.acc = NX.api.trading.accountSync(st.data.me.accountId); renderPositions(); }
      }));
      show(params.tab, params);
    },
    unmount() { offs.forEach((f) => f()); offs = []; st = null; root = null; }
  };
})(window.NX);
