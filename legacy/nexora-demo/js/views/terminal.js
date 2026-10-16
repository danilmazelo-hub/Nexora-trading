/* NEXORA trading terminal: instrument list, asset card, chart, order ticket, positions/orders/history. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store;
  const TFS = ['5m', '15m', '1h', '4h', '1d', '1w'];
  const LIMITS = { '5m': 400, '15m': 400, '1h': 400, '4h': 300, '1d': 365, '1w': 60 };
  let st = null, root = null, offs = [];

  const inst = () => NX.catalog.get(st.sym);
  const accId = () => st && st.me && st.me.accountId;

  function listFor(market) {
    const all = st.instruments;
    if (market === 'favorites') return all.filter((i) => S.isFavorite(i.id));
    if (market === 'all') return all;
    return all.filter((i) => i.market === market);
  }

  /* ---------- Layout ---------- */
  function layout() {
    const m = st.market;
    return '<div class="heading"><div><h1>' + t('market.' + m) + '</h1><p>' + t('market.' + m + '.desc') + '</p></div>' +
      '<div class="actions" id="tPill">' + ui.marketDataPill() + '</div></div>' +
      '<div class="grid c4" id="tStats" style="margin-bottom:14px">' + ui.loading(1) + '</div>' +
      '<div class="term">' +
      '<section class="panel term-list" aria-label="' + t('term.instruments') + '"><div class="filters">' +
      '<label class="sr-only" for="tSearch">' + t('term.search') + '</label><input class="input" id="tSearch" type="search" placeholder="' + t('term.search') + '" value="' + U.esc(st.search) + '" autocomplete="off">' +
      '<div class="chips" id="tSubs"></div>' +
      '<select class="input" id="tSort" aria-label="' + t('term.sort') + '">' + ['default', 'change_desc', 'change_asc', 'name', 'price_desc'].map((s) => '<option value="' + s + '"' + (st.sort === s ? ' selected' : '') + '>' + t('sort.' + s) + '</option>').join('') + '</select>' +
      '</div><div class="ilist" id="tList" role="listbox" aria-label="' + t('term.instruments') + '"></div></section>' +
      '<section class="panel" style="min-width:0" aria-label="' + t('term.chart') + '"><div class="asset-card" id="tCard"></div>' +
      '<div class="chart-toolbar"><div class="seg" role="group" aria-label="' + t('chart.type') + '"><button data-act="ctype" data-v="candles" title="' + t('chart.candles') + '">' + U.icon('candle').replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-3px"') + ' ' + t('chart.candles') + '</button><button data-act="ctype" data-v="line">' + U.icon('line').replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-3px"') + ' ' + t('chart.line') + '</button></div>' +
      '<div class="seg" role="group" aria-label="' + t('chart.tf') + '">' + TFS.map((f) => '<button data-act="tf" data-v="' + f + '">' + NX.market.TF[f].label + '</button>').join('') + '</div>' +
      '<div class="ind-menu"><button class="btn sm" data-act="indmenu" aria-expanded="false">' + U.icon('analysis') + t('chart.indicators') + '</button></div>' +
      '<span class="spacer"></span><div class="seg"><button data-act="zoom" data-v="in" aria-label="' + t('chart.zoomIn') + '" title="' + t('chart.zoomIn') + '">＋</button><button data-act="zoom" data-v="out" aria-label="' + t('chart.zoomOut') + '" title="' + t('chart.zoomOut') + '">－</button><button data-act="zoom" data-v="fit" aria-label="' + t('chart.reset') + '" title="' + t('chart.reset') + '">⟲</button></div></div>' +
      '<div id="tChart"></div><div class="chart-help"><span id="tPeriod"></span><span>' + t('chart.help') + '</span></div></section>' +
      '<aside class="panel order-panel" id="tOrder" aria-label="' + t('order.title') + '"></aside>' +
      '</div>' +
      '<section class="panel term-bottom"><div class="tabs" role="tablist" id="tTabs">' + ['positions', 'orders', 'history', 'trades'].map((k) => '<button role="tab" data-act="btab" data-v="' + k + '" aria-selected="' + (st.bottom === k) + '" class="' + (st.bottom === k ? 'active' : '') + '">' + t('term.tab.' + k) + ' <span class="muted" data-count="' + k + '"></span></button>').join('') + '</div><div id="tBottom">' + ui.loading(3) + '</div></section>';
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    const el = U.$('#tStats', root); if (!el || !st.acc) return;
    const a = st.acc;
    const card = (lbl, val, sub, cls) => '<div class="panel stat"><div class="lbl">' + lbl + '</div><div class="val ' + (cls || '') + '">' + val + '</div><div class="sub">' + sub + '</div></div>';
    el.innerHTML = card(t('acc.equity'), U.usd(a.equity), t('acc.demoAccount') + ' ' + U.esc(a.account.id)) +
      card(t('acc.available'), U.usd(a.available), a.reservedCash > 0 ? t('acc.reserved') + ' ' + U.usd(a.reservedCash) : t('acc.cash') + ' ' + U.usd(a.cash)) +
      card(t('acc.positionsValue'), U.usd(a.positionsValue), t('acc.positionsN', { n: a.positions.length })) +
      card(t('acc.openPnl'), U.signedUsd(a.unrealizedPnl), t('acc.realized') + ' ' + U.signedUsd(a.realizedPnl), U.cls(a.unrealizedPnl));
  }

  /* ---------- Instrument list ---------- */
  function renderSubs() {
    const el = U.$('#tSubs', root); if (!el) return;
    if (st.market === 'favorites') { el.innerHTML = ''; return; }
    const subs = ['all'].concat(st.market === 'all' ? NX.catalog.MARKETS : NX.catalog.SUBS[st.market]);
    el.innerHTML = subs.map((s) => '<button class="chip ' + (st.sub === s ? 'active' : '') + '" data-act="sub" data-v="' + s + '" aria-pressed="' + (st.sub === s) + '">' + t(s === 'all' ? 'sub.all' : st.market === 'all' ? 'market.' + s : 'sub.' + s) + '</button>').join('');
  }
  function filtered() {
    let list = listFor(st.market);
    if (st.sub !== 'all' && st.market !== 'favorites') list = list.filter((i) => (st.market === 'all' ? i.market : i.sub) === st.sub);
    const q = st.search.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.symbol + ' ' + i.name).toLowerCase().indexOf(q) >= 0);
    const qs = {}; list.forEach((i) => { qs[i.id] = NX.market.quote(i.id); });
    if (st.sort === 'change_desc') list.sort((a, b) => (qs[b.id].changePct || 0) - (qs[a.id].changePct || 0));
    if (st.sort === 'change_asc') list.sort((a, b) => qs[a.id].changePct - qs[b.id].changePct);
    if (st.sort === 'name') list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (st.sort === 'price_desc') list.sort((a, b) => NX.market.toUsd(qs[b.id].mid, b.quote) - NX.market.toUsd(qs[a.id].mid, a.quote));
    return { list, qs };
  }
  function renderList() {
    const el = U.$('#tList', root); if (!el) return;
    const { list, qs } = filtered();
    if (!list.length) {
      el.innerHTML = st.market === 'favorites' && !st.search ? ui.empty(t('term.noFav'), t('term.noFavText'), 'star') : ui.empty(t('search.none'), t('search.noneText', { q: st.search }), 'search');
      return;
    }
    el.innerHTML = list.map((i) => {
      const q = qs[i.id], fav = S.isFavorite(i.id);
      return '<div class="irow ' + (i.id === st.sym ? 'selected' : '') + '" role="option" aria-selected="' + (i.id === st.sym) + '" tabindex="0" data-act="pick" data-id="' + U.esc(i.id) + '">' +
        ui.badge(i.id, 'sm') + '<span class="nm"><b>' + U.esc(i.symbol) + '</b><small>' + U.esc(i.name) + (i.enabled ? '' : ' · ' + t('term.disabled')) + '</small></span>' +
        '<span class="px" data-px="' + U.esc(i.id) + '">' + ui.liveDot(i.id) + ui.fmtPrice(i.id, q.mid) + '<small class="' + U.cls(q.changePct) + '">' + U.pct(q.changePct) + '</small></span>' +
        '<button class="fav ' + (fav ? 'on' : '') + '" data-act="fav" data-id="' + U.esc(i.id) + '" aria-pressed="' + fav + '" aria-label="' + t(fav ? 'term.unfav' : 'term.fav') + ' ' + U.esc(i.symbol) + '">' + U.icon('star') + '</button></div>';
    }).join('');
  }
  function tickList() {
    U.$$('[data-px]', root).forEach((el) => {
      const id = el.getAttribute('data-px'), q = NX.market.quote(id), old = el.dataset.v ? Number(el.dataset.v) : q.mid;
      el.innerHTML = ui.liveDot(id) + ui.fmtPrice(id, q.mid) + '<small class="' + U.cls(q.changePct) + '">' + U.pct(q.changePct) + '</small>';
      if (q.mid !== old) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(q.mid > old ? 'flash-up' : 'flash-down'); }
      el.dataset.v = q.mid;
    });
  }

  /* ---------- Asset card ---------- */
  function renderCard() {
    const el = U.$('#tCard', root), i = inst(); if (!el || !i) return;
    const q = NX.market.quote(i.id, null, true), fav = S.isFavorite(i.id);
    el.innerHTML = '<div class="title">' + ui.badge(i.id, 'lg') + '<div><h2>' + U.esc(i.symbol) + ' <button class="fav ' + (fav ? 'on' : '') + '" data-act="fav" data-id="' + U.esc(i.id) + '" aria-pressed="' + fav + '" aria-label="' + t(fav ? 'term.unfav' : 'term.fav') + '">' + U.icon('star') + '</button></h2><small>' + U.esc(i.name) + ' · ' + t('market.' + i.market) + ' · ' + t('sub.' + i.sub) + '</small></div></div>' +
      '<div><div class="price num">' + ui.fmtPrice(i.id, q.mid) + ' <small class="muted" style="font-size:12px;font-weight:600">' + i.quote + '</small></div><div class="chg ' + U.cls(q.changePct) + '">' + (q.change == null ? '—' : (q.change >= 0 ? '+' : '−') + ui.fmtPrice(i.id, Math.abs(q.change)) + ' (' + U.pct(q.changePct) + ')') + ' · <span title="' + t(q.periodKey === 'session' ? 'q.sinceCloseHint' : 'q.24hHint') + '">' + t(q.periodKey === 'session' ? 'q.sinceClose' : 'q.24h') + '</span></div></div>' +
      '<div class="stats"><div>' + t('q.bid') + '<b class="down">' + ui.fmtPrice(i.id, q.bid) + '</b></div><div>' + t('q.ask') + '<b class="up">' + ui.fmtPrice(i.id, q.ask) + '</b></div>' +
      '<div>' + t('q.high24') + '<b>' + ui.fmtPrice(i.id, q.high24) + '</b></div><div>' + t('q.low24') + '<b>' + ui.fmtPrice(i.id, q.low24) + '</b></div><div>' + t('q.vol24') + '<b>' + U.compact(q.volumeUsd24 * NX.market.toUsd(1, i.quote)) + ' $</b></div>' +
      '<div><a class="btn sm" href="#/analysis?s=' + encodeURIComponent(i.id) + '">' + t('nav.analysis') + '</a></div></div>' +
      '<div style="width:100%">' + ui.sourceBadge(q) + '</div>';
  }
  function renderPeriod(ps) {
    const el = U.$('#tPeriod', root); if (!el) return;
    if (!ps) { el.textContent = ''; return; }
    el.innerHTML = t('chart.period') + ': <b class="up">H ' + ui.fmtPrice(st.sym, ps.high) + '</b> · <b class="down">L ' + ui.fmtPrice(st.sym, ps.low) + '</b> · <b class="' + U.cls(ps.change) + '">' + U.pct(ps.change) + '</b> · ' + t('chart.candlesN', { n: ps.count }) +
      (NX.live && NX.live.isSparse(st.sym, st.tf) ? ' · <span class="pill warn" title="' + t('chart.sparseHint') + '">' + t('chart.sparse') + '</span>' : '');
  }

  /* ---------- Chart ---------- */
  function syncToolbar() {
    U.$$('[data-act=ctype]', root).forEach((b) => { b.classList.toggle('active', b.dataset.v === st.chartType); b.setAttribute('aria-pressed', b.dataset.v === st.chartType); });
    U.$$('[data-act=tf]', root).forEach((b) => { b.classList.toggle('active', b.dataset.v === st.tf); b.setAttribute('aria-pressed', b.dataset.v === st.tf); });
  }
  async function loadChart(reset) {
    const host = U.$('#tChart', root); if (!host) return;
    if (!st.chart) st.chart = new NX.Chart(host, { type: st.chartType, indicators: st.ind, onView: renderPeriod });
    const req = ++st.chartReq, key = st.sym + '|' + st.tf, sym = st.sym, tf = st.tf;
    st.chart.showLoading(key);
    renderPeriod(null);
    try {
      const data = await NX.api.market.candles(sym, tf, LIMITS[tf]);
      if (!st || req !== st.chartReq || !st.chart) return;
      st.chart.load(key, data, { decimals: NX.catalog.get(sym).decimals, tf });
      st.chartLive = NX.market.isLive(sym);
      renderPeriod(st.chart.periodStats());
    } catch (e) { host.innerHTML = ui.error(e, 'reloadChart'); st.chart = null; }
    if (reset) syncToolbar();
  }

  /* ---------- Order ticket ---------- */
  function orderReq() {
    const i = inst(), q = NX.market.quote(i.id);
    const px = st.otype === 'limit' ? Number(st.limit) || 0 : (st.side === 'buy' ? q.ask : q.bid);
    let qty = Number(String(st.input).replace(',', '.')) || 0;
    if (st.mode === 'usd' && px > 0) qty = U.floorTo(qty / (px * NX.market.toUsd(1, i.quote)), i.qtyStep);
    return { instrumentId: i.id, side: st.side, type: st.otype, qty, limitPrice: st.otype === 'limit' ? Number(st.limit) : null };
  }
  function renderOrder() {
    const el = U.$('#tOrder', root), i = inst(); if (!el || !i) return;
    const disabled = !i.enabled;
    const unitLbl = i.market === 'forex' ? i.base : i.market === 'stocks' ? t('unit.shares') : i.market === 'indices' ? t('unit.contracts') : (i.unit || i.base);
    el.innerHTML = '<div class="panel-title"><h3>' + t('order.title') + '</h3><span class="pill warn">' + t('demo.badge') + '</span></div><div class="body">' +
      '<div class="side-tabs full" role="group" aria-label="' + t('order.side') + '"><button class="b ' + (st.side === 'buy' ? 'on' : '') + '" data-act="side" data-v="buy" aria-pressed="' + (st.side === 'buy') + '">' + t('side.buy') + '</button><button class="s ' + (st.side === 'sell' ? 'on' : '') + '" data-act="side" data-v="sell" aria-pressed="' + (st.side === 'sell') + '">' + t('side.sell') + '</button></div>' +
      '<div class="seg full" role="group" aria-label="' + t('order.type') + '" style="display:flex"><button style="flex:1" class="' + (st.otype === 'market' ? 'active' : '') + '" data-act="otype" data-v="market">' + t('order.market') + '</button><button style="flex:1" class="' + (st.otype === 'limit' ? 'active' : '') + '" data-act="otype" data-v="limit">' + t('order.limit') + '</button></div>' +
      (st.otype === 'limit' ? '<div class="field full"><label for="oLimit">' + t('order.limitPrice') + ' (' + i.quote + ')</label><div class="input-group"><input id="oLimit" class="input" inputmode="decimal" value="' + U.esc(st.limit) + '" autocomplete="off"><span>' + i.quote + '</span></div></div>' : '') +
      '<div class="field full"><div style="display:flex;justify-content:space-between;align-items:center"><label for="oQty" class="lbl">' + (st.mode === 'usd' ? t('order.amountUsd') : t('order.qty') + ' (' + U.esc(unitLbl) + ')') + '</label>' +
      '<div class="seg"><button class="' + (st.mode === 'qty' ? 'active' : '') + '" data-act="mode" data-v="qty">' + t('order.byQty') + '</button><button class="' + (st.mode === 'usd' ? 'active' : '') + '" data-act="mode" data-v="usd">USD</button></div></div>' +
      '<div class="input-group"><input id="oQty" class="input" inputmode="decimal" autocomplete="off" value="' + U.esc(st.input) + '" placeholder="0" aria-describedby="oMsg"><span>' + (st.mode === 'usd' ? 'USD' : U.esc(unitLbl)) + '</span></div></div>' +
      '<div class="quick full">' + [25, 50, 75, 100].map((p) => '<button data-act="pct" data-v="' + p + '">' + p + '%</button>').join('') + '</div>' +
      '<div class="full" id="oCalc"></div>' +
      '<div class="full order-msg" id="oMsg" aria-live="polite"></div>' +
      '<button class="btn block full ' + (st.side === 'buy' ? 'buy' : 'sell') + '" data-act="submit" id="oSubmit"' + (disabled ? ' disabled' : '') + '>' + t(st.side === 'buy' ? 'order.buyBtn' : 'order.sellBtn', { s: U.esc(i.symbol) }) + '</button>' +
      '<p class="notice full" style="margin:0">' + (disabled ? t('order.disabled') : t('order.note')) + '</p></div>' +
      (NX.live && NX.live.hasBook(i.id) ? '<section class="book" id="tBook" aria-label="' + t('book.title') + '">' + bookHtml() + '</section>' : '');
    renderCalc();
  }

  /* ---------- Order book (crypto, Binance) ---------- */
  function bookHtml() {
    const i = inst(), b = NX.live.book[i.id];
    const head = '<div class="book-head"><h3>' + t('book.title') + '</h3><span class="src-note">' + (b ? U.esc(b.src) + ' · USDT' + (b.fallback ? ' · ' + t('live.backup') : '') + ' · ' + U.time(b.fetchedAt) : '') + '</span></div>';
    if (!b || !b.bids.length || !b.asks.length) return head + '<div class="book-empty muted">' + t(b ? 'book.empty' : 'book.loading') + '</div>';
    const n = 8, asks = b.asks.slice(0, n), bids = b.bids.slice(0, n);
    const cum = (rows) => { let s = 0; return rows.map((r) => (s += r[1])); };
    const ca = cum(asks), cb = cum(bids), max = Math.max(ca[ca.length - 1], cb[cb.length - 1]) || 1;
    const qf = (v) => U.fmt(v, v >= 1000 ? 0 : v >= 1 ? 3 : 5);
    const row = (r, c, side) => '<button class="brow ' + side + '" data-act="bookpx" data-v="' + r[0] + '" title="' + t('book.pick') + '"><i style="width:' + (c / max * 100).toFixed(1) + '%"></i><span class="' + (side === 'ask' ? 'down' : 'up') + '">' + ui.fmtPrice(i.id, r[0]) + '</span><span>' + qf(r[1]) + '</span><span>' + qf(c) + '</span></button>';
    const spread = asks[0][0] - bids[0][0], mid = (asks[0][0] + bids[0][0]) / 2;
    return head + '<div class="book-cols"><span>' + t('book.price') + '</span><span>' + t('book.qty') + ' (' + U.esc(i.base) + ')</span><span>' + t('book.total') + '</span></div>' +
      asks.map((r, k) => row(r, ca[k], 'ask')).reverse().join('') +
      '<div class="book-mid"><b>' + ui.fmtPrice(i.id, mid) + '</b><span class="muted">' + t('book.spread') + ' ' + ui.fmtPrice(i.id, spread) + ' (' + U.fmt(spread / mid * 10000, 2) + ' bps)</span></div>' +
      bids.map((r, k) => row(r, cb[k], 'bid')).join('') +
      '<p class="src-note" style="margin:6px 0 0">' + t('book.note') + '</p>';
  }
  function renderBook() { const el = U.$('#tBook', root); if (el && st) el.innerHTML = bookHtml(); }
  function pollBook() {
    if (!st || !NX.live || document.hidden || !NX.live.hasBook(st.sym)) return;
    const sym = st.sym;
    NX.live.fetchBook(sym, 10).then(() => { if (st && st.sym === sym) renderBook(); });
  }
  function renderCalc() {
    const el = U.$('#oCalc', root), msg = U.$('#oMsg', root), btn = U.$('#oSubmit', root); if (!el || !accId()) return;
    const i = inst(), req = orderReq(), pv = NX.api.trading.preview(accId(), req);
    st.pv = pv;
    const feeCfg = st.fees ? st.fees.fees[i.market] : null;
    const row = (k, v, cls) => '<div class="kv"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    let h = row(st.otype === 'limit' ? t('order.limitPrice') : (st.side === 'buy' ? t('q.ask') : t('q.bid')), ui.fmtPrice(i.id, pv.price) + ' ' + i.quote) +
      row(t('order.qty'), pv.qty > 0 ? ui.fmtQty(i.id, pv.qty) : '—') +
      row(t('order.notional'), U.usd(pv.notionalUsd)) +
      row(t('order.fee') + (feeCfg ? ' (' + U.fmt(feeCfg.rate * 100, 3) + '%, min ' + U.usd(feeCfg.min) + ')' : ''), U.usd(pv.fee)) +
      '<div class="kv total"><span>' + t(st.side === 'buy' ? 'order.totalCost' : 'order.proceeds') + '</span><b>' + U.usd(pv.totalUsd) + '</b></div>';
    if (st.side === 'buy') h += row(t('acc.available'), U.usd(pv.available)) + row(t('order.availableAfter'), U.usd(pv.availableAfter), pv.availableAfter < 0 ? 'down' : '');
    else {
      h += row(t('order.position'), ui.fmtQty(i.id, pv.positionQty)) + row(t('order.availableQty'), ui.fmtQty(i.id, pv.availableQty));
      if (pv.estPnl != null && pv.qty > 0) h += row(t('order.estPnl'), U.signedUsd(pv.estPnl), U.cls(pv.estPnl));
    }
    el.innerHTML = h;
    const hasInput = Number(String(st.input).replace(',', '.')) > 0;
    const errs = pv.errors.filter((e) => hasInput || e !== 'err.qty');
    // Warnings that change the outcome of the order are shown before submitting, not after.
    const warns = [];
    if (pv.marketable) warns.push(t(pv.side === 'buy' ? 'order.marketableBuy' : 'order.marketableSell', { price: ui.fmtPrice(i.id, pv.price) + ' ' + i.quote }));
    else if (pv.farFromMarket) warns.push(t('order.farFromMarket'));
    if (pv.quote && pv.quote.live && pv.quote.live.simulated) warns.push(t('order.simPrice', { src: U.esc(pv.quote.live.src) }));
    else if (pv.quote && pv.quote.live && pv.quote.live.marketOpen === false) warns.push(t('order.marketClosed'));
    const warnHtml = warns.length ? '<div class="notice warn">' + warns.join('<br>') + '</div>' : '';
    msg.innerHTML = errs.length && (hasInput || st.otype === 'limit') ? '<div class="notice err">' + errs.map((e) => t(e, { min: (st.fees || {}).minOrderUsd || 1 })).join('<br>') + '</div>' + warnHtml : (warnHtml || (!hasInput && st.okMsg ? st.okMsg : ''));
    if (btn) btn.disabled = !pv.ok || !i.enabled || st.busy;
  }
  function setPct(p) {
    const i = inst(), pv0 = NX.api.trading.preview(accId(), { instrumentId: i.id, side: st.side, type: st.otype, qty: 0, limitPrice: st.otype === 'limit' ? Number(st.limit) : null });
    let qty;
    if (st.side === 'sell') qty = U.floorTo(pv0.availableQty * p / 100, i.qtyStep);
    else {
      const unit = pv0.price * NX.market.toUsd(1, i.quote);
      const rate = st.fees ? st.fees.fees[i.market].rate : 0.001;
      qty = U.floorTo(pv0.available * p / 100 / (unit * (1 + rate)), i.qtyStep);
      for (let k = 0; k < 60 && qty > 0; k++) {
        const pv = NX.api.trading.preview(accId(), { instrumentId: i.id, side: 'buy', type: st.otype, qty, limitPrice: st.otype === 'limit' ? Number(st.limit) : null });
        if (pv.errors.indexOf('err.funds') < 0) break;
        qty = U.floorTo(qty * 0.995 - i.qtyStep, i.qtyStep);
      }
    }
    qty = Math.max(0, qty);
    if (st.mode === 'usd') st.input = String(U.round(qty * pv0.price * NX.market.toUsd(1, i.quote), 2));
    else st.input = String(qty);
    const inp = U.$('#oQty', root); if (inp) inp.value = st.input;
    renderCalc();
  }
  async function submit() {
    const btn = U.$('#oSubmit', root), i = inst();
    if (!st.pv || !st.pv.ok) { renderCalc(); return; }
    st.busy = true; ui.busy(btn, true);
    try {
      const r = await NX.api.trading.placeOrder(accId(), orderReq());
      if (r.trade) ui.toast(t('order.filled', { side: t('side.' + r.trade.side), qty: ui.fmtQty(i.id, r.trade.qty), s: i.symbol, price: ui.fmtPrice(i.id, r.trade.price) }) + '<br><span class="muted">' + t('order.feeCharged', { fee: U.usd(r.trade.fee) }) + (r.trade.realizedPnl != null ? ' · ' + t('order.realized', { pnl: U.signedUsd(r.trade.realizedPnl) }) : '') + '</span>');
      else ui.toast(t('order.limitPlaced', { side: t('side.' + r.order.side), qty: ui.fmtQty(i.id, r.order.qty), s: i.symbol, price: ui.fmtPrice(i.id, r.order.limitPrice) }), 'info');
      st.input = '';
      const inp = U.$('#oQty', root); if (inp) inp.value = '';
      st.okMsg = '<div class="notice ok">' + (r.trade ? t('order.doneShort') : t('order.limitShort')) + '</div>';
      await refreshAccount();
    } catch (e) {
      st.okMsg = '<div class="notice err">' + U.esc(ui.errText(e)) + '</div>';
      ui.toast(ui.errText(e), 'err');
    } finally { st.busy = false; ui.busy(btn, false); renderCalc(); }
  }

  /* ---------- Bottom tables ---------- */
  function renderBottom() {
    const el = U.$('#tBottom', root); if (!el || !st.acc) return;
    const counts = { positions: st.acc.positions.length, orders: st.orders.filter((o) => o.status === 'open').length, history: st.orders.filter((o) => o.status !== 'open').length, trades: st.trades.length };
    U.$$('[data-count]', root).forEach((s) => { s.textContent = '(' + counts[s.dataset.count] + ')'; });
    U.$$('[data-act=btab]', root).forEach((b) => { b.classList.toggle('active', b.dataset.v === st.bottom); b.setAttribute('aria-selected', b.dataset.v === st.bottom); });
    const td = (label, v, cls) => '<td data-label="' + U.esc(label) + '" class="' + (cls || '') + '">' + v + '</td>';
    const asset = (id) => '<div class="asset">' + ui.badge(id, 'xs') + '<span>' + U.esc((NX.catalog.get(id) || {}).symbol || id) + '</span></div>';
    if (st.bottom === 'positions') {
      if (!st.acc.positions.length) { el.innerHTML = ui.empty(t('term.noPositions'), t('term.noPositionsText'), 'portfolio'); return; }
      const H = [t('col.instrument'), t('col.qty'), t('col.avg'), t('col.price'), t('col.value'), t('col.pnl'), ''];
      el.innerHTML = '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h, k) => '<th class="' + (k > 0 && k < 6 ? 'r' : '') + '">' + h + '</th>').join('') + '</tr></thead><tbody>' +
        st.acc.positions.map((p) => '<tr>' + td(H[0], asset(p.instrumentId)) + td(H[1], ui.fmtQty(p.instrumentId, p.qty), 'r') + td(H[2], ui.fmtPrice(p.instrumentId, p.avgPrice), 'r') + td(H[3], ui.fmtPrice(p.instrumentId, p.price), 'r') + td(H[4], U.usd(p.valueUsd), 'r') +
          td(H[5], '<span class="' + U.cls(p.pnlUsd) + '">' + U.signedUsd(p.pnlUsd) + ' (' + U.pct(p.pnlPct) + ')</span>', 'r') +
          td('', '<button class="btn sm" data-act="trade" data-id="' + U.esc(p.instrumentId) + '">' + t('term.open') + '</button> <button class="btn sm sell" data-act="sellall" data-id="' + U.esc(p.instrumentId) + '">' + t('term.sellAll') + '</button>') + '</tr>').join('') + '</tbody></table></div>';
    } else if (st.bottom === 'orders' || st.bottom === 'history') {
      const list = st.orders.filter((o) => (st.bottom === 'orders' ? o.status === 'open' : o.status !== 'open'));
      if (!list.length) { el.innerHTML = ui.empty(t(st.bottom === 'orders' ? 'term.noOrders' : 'term.noHistory'), '', 'list'); return; }
      const H = [t('col.time'), t('col.instrument'), t('col.side'), t('col.type'), t('col.qty'), t('col.price'), t('col.status'), ''];
      el.innerHTML = '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
        list.slice(0, 100).map((o) => '<tr>' + td(H[0], U.dateTime(o.createdAt)) + td(H[1], asset(o.instrumentId)) + td(H[2], ui.side(o.side)) + td(H[3], t('order.' + o.type)) + td(H[4], ui.fmtQty(o.instrumentId, o.qty)) +
          td(H[5], o.fillPrice ? ui.fmtPrice(o.instrumentId, o.fillPrice) : o.limitPrice ? ui.fmtPrice(o.instrumentId, o.limitPrice) + ' (' + t('order.limitShortLbl') + ')' : '—') + td(H[6], ui.status('ost', o.status) + (o.reason ? ' <small class="muted">' + t(o.reason) + '</small>' : '')) +
          td('', o.status === 'open' ? '<button class="btn sm danger" data-act="cancel" data-id="' + o.id + '">' + t('btn.cancelOrder') + '</button>' : '') + '</tr>').join('') + '</tbody></table></div>';
    } else {
      if (!st.trades.length) { el.innerHTML = ui.empty(t('term.noTrades'), '', 'history'); return; }
      const H = [t('col.time'), t('col.instrument'), t('col.side'), t('col.qty'), t('col.price'), t('col.notional'), t('col.fee'), t('col.realized')];
      el.innerHTML = '<div class="table-wrap"><table class="dt cards"><thead><tr>' + H.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
        st.trades.slice(0, 100).map((x) => '<tr>' + td(H[0], U.dateTime(x.at)) + td(H[1], asset(x.instrumentId)) + td(H[2], ui.side(x.side)) + td(H[3], ui.fmtQty(x.instrumentId, x.qty)) + td(H[4], ui.fmtPrice(x.instrumentId, x.price) + ' ' + x.quoteCcy) +
          td(H[5], U.usd(x.notionalUsd)) + td(H[6], U.usd(x.fee)) + td(H[7], x.realizedPnl == null ? '—' : '<span class="' + U.cls(x.realizedPnl) + '">' + U.signedUsd(x.realizedPnl) + '</span>') + '</tr>').join('') + '</tbody></table></div>';
    }
  }

  async function refreshAccount() {
    if (!accId()) return;
    try {
      const [acc, orders, trades] = await Promise.all([NX.api.trading.account(accId()), NX.api.trading.orders(accId()), NX.api.trading.trades(accId())]);
      if (!st) return;
      st.acc = acc; st.orders = orders; st.trades = trades;
      if (NX.live) NX.live.want(acc.positions.map((p) => p.instrumentId).concat(S.state.favorites));
      renderStats(); renderBottom(); renderCalc();
    } catch (e) { const b = U.$('#tBottom', root); if (b) b.innerHTML = ui.error(e, 'reloadAcc'); }
  }

  function selectInstrument(id, pushUrl) {
    const i = NX.catalog.get(id); if (!i) return;
    st.sym = id; st.input = ''; st.limit = ''; st.okMsg = null; S.set('terminal.symbol', id);
    if (st.market !== 'favorites' && st.market !== 'all' && i.market !== st.market) { NX.go('/trade/' + i.market + '?s=' + encodeURIComponent(id)); return; }
    if (pushUrl) history.replaceState(null, '', '#/trade/' + st.market + '?s=' + encodeURIComponent(id));
    U.$$('.irow', root).forEach((r) => { const on = r.dataset.id === id; r.classList.toggle('selected', on); r.setAttribute('aria-selected', on); });
    renderCard(); renderOrder(); loadChart(true);
    if (NX.live) { NX.live.focus(id); pollBook(); }
  }

  // Prepares (does not execute) a sell of the whole available position.
  function prefillSellAll(id) {
    st.side = 'sell'; st.otype = 'market'; st.mode = 'qty'; renderOrder();
    const pv = NX.api.trading.preview(accId(), { instrumentId: id, side: 'sell', type: 'market', qty: 0 });
    st.input = String(pv.availableQty || 0); U.$('#oQty', root).value = st.input; renderCalc();
    U.$('#tOrder', root).scrollIntoView({ behavior: 'smooth', block: 'center' });
    U.$('#oSubmit', root).focus();
  }

  function onTick() {
    if (!st || !root) return;
    tickList(); renderCard();
    if (st.chart && st.chart.key === st.sym + '|' + st.tf) st.chart.mergeLive(NX.api.market.candlesSync(st.sym, st.tf, 2), st.sym + '|' + st.tf);
    if (accId()) { st.acc = NX.api.trading.accountSync(accId()); renderStats(); if (st.bottom === 'positions') renderBottom(); }
    if (!st.busy) renderCalc();
  }

  NX.views = NX.views || {};
  NX.views.terminal = {
    title: (p) => t('nav.terminal') + ' · ' + t('market.' + (p.market || 'all')),
    async mount(el, params) {
      root = el;
      const saved = S.state.terminal;
      let market = params.market || 'all';
      if (NX.catalog.MARKETS.indexOf(market) < 0 && market !== 'favorites') market = 'all';
      let sym = params.s && NX.catalog.get(params.s) ? params.s : null;
      if (!sym) { const cand = NX.catalog.get(saved.symbol); sym = cand && (cand.market === market || market === 'favorites' || market === 'all') ? cand.id : (market === 'favorites' ? (S.state.favorites[0] || 'BTC/USD') : market === 'all' ? 'BTC/USD' : NX.catalog.byMarket(market)[0].id); }
      st = { market, sym, tf: saved.tf, chartType: saved.chartType, ind: Object.assign({}, saved.indicators), side: params.side === 'sell' ? 'sell' : 'buy', otype: 'market', mode: 'qty', input: '', limit: '', sub: 'all', search: '', sort: 'default', bottom: 'positions', chartReq: 0, instruments: NX.catalog.all(), me: null, acc: null, orders: [], trades: [] };
      el.innerHTML = layout();
      renderSubs(); renderList(); renderCard(); syncToolbar();
      offs.push(ui.delegate(el, handlers));
      offs.push(ui.delegate(el, { 'keydown:pick': (e2, ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectInstrument(e2.dataset.id, true); } }, 'keydown:sort': (e2, ev) => { if (ev.key === 'Enter') handlers.sort(e2); } }, ['keydown']));
      U.$('#tSearch', el).addEventListener('input', U.debounce((e) => { st.search = e.target.value; renderList(); }, 120));
      U.$('#tSort', el).addEventListener('change', (e) => { st.sort = e.target.value; renderList(); });
      el.addEventListener('input', (e) => {
        if (e.target.id === 'oQty') { st.input = e.target.value; st.okMsg = null; renderCalc(); }
        if (e.target.id === 'oLimit') { st.limit = e.target.value; renderCalc(); }
      });
      el.addEventListener('keydown', (e) => { if ((e.target.id === 'oQty' || e.target.id === 'oLimit') && e.key === 'Enter') { e.preventDefault(); submit(); } });
      offs.push(NX.api.market.subscribe(onTick));
      // Live prices arrived (or stopped) for the open instrument → reload the chart from the right source.
      offs.push(NX.bus.on('live:update', () => {
        if (!st) return;
        if (st.chart && st.chart.key && NX.market.isLive(st.sym) !== st.chartLive) loadChart(false);
        tickList(); renderCard(); renderCalc();
        const p = U.$('#tPill', root); if (p) p.innerHTML = ui.marketDataPill();
      }));
      if (NX.live) { NX.live.focus(st.sym); pollBook(); }
      const bookTimer = setInterval(pollBook, 2000);   // order book refresh while the terminal is open
      offs.push(() => clearInterval(bookTimer));
      offs.push(NX.bus.on('db:change', U.debounce(() => { refreshAccount(); }, 100)));
      loadChart(true);
      try {
        const [me, fees, instruments] = await Promise.all([NX.api.me.get(), NX.api.market.fees(), NX.api.market.instruments()]);
        if (!st) return;
        st.me = me; st.fees = fees; st.instruments = instruments;
        renderList(); renderOrder(); await refreshAccount();
        if (params.side === 'sell' && st && st.acc.positions.some((p) => p.instrumentId === st.sym)) prefillSellAll(st.sym);
      } catch (e) { U.$('#tStats', el).innerHTML = ui.error(e, 'reloadAll'); }
    },
    update(params) {
      if (!st) return false;
      const market = params.market || 'all';
      if (market !== st.market) return false;
      if (params.s && params.s !== st.sym) selectInstrument(params.s, false);
      return true;
    },
    unmount() { offs.forEach((f) => f()); offs = []; if (st && st.chart) st.chart.destroy(); st = null; root = null; }
  };

  const handlers = {
    pick: (el, e) => { if (e.target.closest('[data-act=fav]')) return; selectInstrument(el.dataset.id, true); },
    fav: (el, e) => { e.stopPropagation(); const on = S.toggleFavorite(el.dataset.id); ui.toast(t(on ? 'term.favAdded' : 'term.favRemoved', { s: el.dataset.id }), 'info', 2000); renderList(); renderCard(); },
    sub: (el) => { st.sub = el.dataset.v; renderSubs(); renderList(); },
    ctype: (el) => { st.chartType = el.dataset.v; S.set('terminal.chartType', st.chartType); if (st.chart) st.chart.setType(st.chartType); syncToolbar(); },
    tf: (el) => { st.tf = el.dataset.v; S.set('terminal.tf', st.tf); syncToolbar(); loadChart(true); },
    zoom: (el) => { if (!st.chart) return; if (el.dataset.v === 'in') st.chart.zoom(0.75); else if (el.dataset.v === 'out') st.chart.zoom(1.33); else { st.chart.resetView(); st.chart.draw(); renderPeriod(st.chart.periodStats()); } },
    indmenu: (el) => {
      const host = el.parentElement, old = host.querySelector('.ind-pop'); if (old) { old.remove(); el.setAttribute('aria-expanded', 'false'); return; }
      const pop = document.createElement('div'); pop.className = 'ind-pop';
      pop.innerHTML = [['sma', 'SMA 20 / 50'], ['ema', 'EMA 21'], ['bb', 'Bollinger 20, 2'], ['rsi', 'RSI 14'], ['macd', 'MACD 12 26 9']].map((x) => '<label class="check"><input type="checkbox" data-ind="' + x[0] + '"' + (st.ind[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>').join('') + '<span class="muted" style="font-size:10px">' + t('chart.indNote') + '</span>';
      host.appendChild(pop); el.setAttribute('aria-expanded', 'true');
      pop.addEventListener('change', (e) => { const k = e.target.dataset.ind; st.ind[k] = e.target.checked; S.set('terminal.indicators', Object.assign({}, st.ind)); if (st.chart) st.chart.setIndicators(st.ind); });
      const close = (e) => { if (!host.contains(e.target)) { pop.remove(); el.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', close); } };
      setTimeout(() => document.addEventListener('click', close), 0);
    },
    side: (el) => { st.side = el.dataset.v; st.input = ''; st.okMsg = null; renderOrder(); },
    otype: (el) => { st.otype = el.dataset.v; if (st.otype === 'limit' && !st.limit) st.limit = String(U.round(NX.market.quote(st.sym).mid, inst().decimals)); renderOrder(); },
    mode: (el) => { st.mode = el.dataset.v; st.input = ''; renderOrder(); },
    pct: (el) => setPct(Number(el.dataset.v)),
    // Clicking a book level only fills the limit price in the form; nothing is sent.
    bookpx: (el) => { st.otype = 'limit'; st.limit = String(U.round(Number(el.dataset.v), inst().decimals)); renderOrder(); const f = U.$('#oLimit', root); if (f) f.focus(); },
    submit: () => submit(),
    btab: (el) => { st.bottom = el.dataset.v; renderBottom(); },
    trade: (el) => selectInstrument(el.dataset.id, true),
    sellall: (el) => {
      const id = el.dataset.id;
      if (NX.catalog.get(id).market !== st.market && st.market !== 'favorites' && st.market !== 'all') { NX.go('/trade/' + NX.catalog.get(id).market + '?s=' + encodeURIComponent(id) + '&side=sell'); return; }
      if (st.sym !== id) selectInstrument(id, true);
      prefillSellAll(id);
    },
    cancel: async (el) => {
      ui.busy(el, true);
      try { await NX.api.trading.cancelOrder(el.dataset.id); ui.toast(t('order.cancelled'), 'info'); await refreshAccount(); }
      catch (e) { ui.toast(ui.errText(e), 'err'); ui.busy(el, false); }
    },
    reloadChart: () => { U.$('#tChart', root).innerHTML = ''; loadChart(true); },
    reloadAcc: () => refreshAccount(),
    reloadAll: () => location.reload()
  };
})(window.NX);
