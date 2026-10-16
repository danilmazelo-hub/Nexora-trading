/* NEXORA market heatmap: price change over a period, from the same simulator as quotes and charts. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store;
  const SCALE = { '1d': 3, '1w': 6, '1m': 12, '3m': 20, '1y': 40 }; // ±% that maps to full colour
  let st = null, root = null, offs = [];

  // Diverging scale: red ← neutral → green, clamped at ±SCALE.
  function color(pct, period) {
    const x = U.clamp(pct / SCALE[period], -1, 1), a = Math.abs(x);
    const n = [26, 48, 69], g = [8, 150, 98], r = [196, 48, 70];
    const to = x >= 0 ? g : r, k = Math.pow(a, 0.75);
    const c = n.map((v, i) => Math.round(v + (to[i] - v) * k));
    return 'rgb(' + c.join(',') + ')';
  }

  function data() {
    let list = NX.catalog.all().filter((i) => st.market === 'all' || i.market === st.market);
    if (st.market !== 'all' && st.sub !== 'all') list = list.filter((i) => i.sub === st.sub);
    const q = st.search.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.symbol + ' ' + i.name).toLowerCase().indexOf(q) >= 0);
    const rows = list.map((i) => { const c = NX.market.changeOver(i.id, st.period); return { i, pct: c.pct, now: c.now, liq: i.liquidityUsd }; });
    const s = st.sort;
    rows.sort((a, b) => s === 'change_asc' ? a.pct - b.pct : s === 'name' ? a.i.symbol.localeCompare(b.i.symbol) : s === 'liquidity' ? b.liq - a.liq : b.pct - a.pct);
    return rows;
  }
  const target = (id) => {
    const i = NX.catalog.get(id), s = S.state.session;
    return s && s.role === 'client' ? '/trade/all?s=' + encodeURIComponent(id) : '/analysis?s=' + encodeURIComponent(id);
  };

  function controls() {
    const markets = ['all'].concat(NX.catalog.MARKETS);
    return '<div class="hm-controls"><div class="chips" role="group" aria-label="' + t('hm.market') + '">' + markets.map((m) => '<button class="chip ' + (st.market === m ? 'active' : '') + '" data-act="market" data-v="' + m + '" aria-pressed="' + (st.market === m) + '">' + t(m === 'all' ? 'hm.allMarkets' : 'market.' + m) + '</button>').join('') + '</div></div>' +
      (st.market !== 'all' ? '<div class="hm-controls"><div class="chips">' + ['all'].concat(NX.catalog.SUBS[st.market]).map((s) => '<button class="chip ' + (st.sub === s ? 'active' : '') + '" data-act="sub" data-v="' + s + '">' + t(s === 'all' ? 'sub.all' : 'sub.' + s) + '</button>').join('') + '</div></div>' : '') +
      '<div class="hm-controls"><div class="seg" role="group" aria-label="' + t('hm.period') + '">' + Object.keys(SCALE).map((p) => '<button class="' + (st.period === p ? 'active' : '') + '" data-act="period" data-v="' + p + '" aria-pressed="' + (st.period === p) + '">' + t('period.' + p) + '</button>').join('') + '</div>' +
      '<select class="input" id="hmSort" style="width:auto;min-height:34px;padding:6px 10px" aria-label="' + t('term.sort') + '">' + ['change_desc', 'change_asc', 'liquidity', 'name'].map((s) => '<option value="' + s + '"' + (st.sort === s ? ' selected' : '') + '>' + t('sort.' + s) + '</option>').join('') + '</select>' +
      '<input class="input" id="hmSearch" type="search" placeholder="' + t('term.search') + '" value="' + U.esc(st.search) + '" style="width:auto;flex:0 1 200px;min-height:34px;padding:6px 10px" aria-label="' + t('term.search') + '">' +
      '<div class="seg" role="group" aria-label="' + t('hm.view') + '"><button class="' + (st.view === 'tiles' ? 'active' : '') + '" data-act="view" data-v="tiles">' + t('hm.tiles') + '</button><button class="' + (st.view === 'list' ? 'active' : '') + '" data-act="view" data-v="list">' + t('hm.list') + '</button></div>' +
      '<div class="hm-legend" aria-label="' + t('hm.legend') + '"><span>−' + SCALE[st.period] + '%</span><span class="bar" style="background:linear-gradient(90deg,' + color(-SCALE[st.period], st.period) + ',' + color(-SCALE[st.period] / 2, st.period) + ',' + color(0, st.period) + ',' + color(SCALE[st.period] / 2, st.period) + ',' + color(SCALE[st.period], st.period) + ')"></span><span>+' + SCALE[st.period] + '%</span></div></div>';
  }

  function render() {
    if (!root) return;
    const rows = data();
    const grid = U.$('#hmGrid', root), side = U.$('#hmSide', root);
    if (!rows.length) { grid.innerHTML = ui.empty(t('search.none'), t('search.noneText', { q: st.search }), 'search'); side.innerHTML = ''; return; }
    const byLiq = rows.slice().sort((a, b) => b.liq - a.liq).slice(0, rows.length > 12 ? 4 : 0).map((r) => r.i.id);
    if (st.view === 'tiles') {
      grid.innerHTML = '<div class="hm-grid">' + rows.map((r) => '<button class="hm-tile ' + (byLiq.indexOf(r.i.id) >= 0 ? 'big' : '') + '" style="background:' + color(r.pct, st.period) + '" data-act="open" data-id="' + U.esc(r.i.id) + '" aria-label="' + U.esc(r.i.symbol + ', ' + r.i.name + ', ' + U.pct(r.pct)) + '">' +
        ui.badge(r.i.id, 'xs') + '<span class="ch">' + U.pct(r.pct) + '</span><b>' + ui.liveDot(r.i.id) + U.esc(r.i.symbol) + '</b><small>' + U.esc(r.i.name) + '</small><small class="num">' + ui.fmtPrice(r.i.id, r.now) + ' ' + r.i.quote + '</small></button>').join('') + '</div>';
    } else {
      grid.innerHTML = '<div class="table-wrap"><table class="dt"><thead><tr><th>' + t('col.instrument') + '</th><th class="r">' + t('col.price') + '</th><th class="r">' + t('hm.change') + '</th><th></th></tr></thead><tbody>' + rows.map((r) =>
        '<tr class="clickable" data-act="open" data-id="' + U.esc(r.i.id) + '" tabindex="0"><td><div class="asset">' + ui.badge(r.i.id, 'xs') + '<span>' + U.esc(r.i.symbol) + '<small>' + U.esc(r.i.name) + '</small></span></div></td><td class="r">' + ui.fmtPrice(r.i.id, r.now) + '</td><td class="r"><span class="status" style="background:' + color(r.pct, st.period) + ';color:#fff">' + U.pct(r.pct) + '</span></td><td class="r">' + U.icon('up').replace('<svg', '<svg style="width:14px;height:14px;transform:rotate(90deg)"') + '</td></tr>').join('') + '</tbody></table></div>';
    }
    renderSide(rows);
  }
  function renderSide(rows) {
    const side = U.$('#hmSide', root); if (!side || !rows.length) return;
    const up = rows.filter((r) => r.pct > 0.005).length, down = rows.filter((r) => r.pct < -0.005).length;
    const avg = U.sum(rows, (r) => r.pct) / rows.length;
    const best = rows.slice().sort((a, b) => b.pct - a.pct), mover = (r) => '<button class="mover" data-act="open" data-id="' + U.esc(r.i.id) + '">' + ui.badge(r.i.id, 'sm') + '<span><b>' + U.esc(r.i.symbol) + '</b><small>' + U.esc(r.i.name) + '</small></span><b class="' + U.cls(r.pct) + '">' + U.pct(r.pct) + '</b></button>';
    side.innerHTML = '<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>' + t('hm.breadth') + '</h3><small>' + t('period.' + st.period) + '</small></div><div class="panel-body">' +
      '<div class="kv"><span>' + t('hm.advancing') + '</span><b class="up">' + up + '</b></div><div class="kv"><span>' + t('hm.declining') + '</span><b class="down">' + down + '</b></div><div class="kv"><span>' + t('hm.unchanged') + '</span><b>' + (rows.length - up - down) + '</b></div><div class="kv"><span>' + t('hm.avg') + '</span><b class="' + U.cls(avg) + '">' + U.pct(avg) + '</b></div>' +
      '<div class="alloc-bar" style="margin:10px 0 0"><span style="width:' + (up / rows.length * 100) + '%;background:#18d27c"></span><span style="width:' + ((rows.length - up - down) / rows.length * 100) + '%;background:#2a4258"></span><span style="width:' + (down / rows.length * 100) + '%;background:#ff5c6c"></span></div></div></div>' +
      '<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>' + t('hm.gainers') + '</h3></div><div class="movers">' + best.slice(0, 5).map(mover).join('') + '</div></div>' +
      '<div class="panel"><div class="panel-title"><h3>' + t('hm.losers') + '</h3></div><div class="movers">' + best.slice(-5).reverse().map(mover).join('') + '</div></div>';
  }
  // Live tick: update values in place (keeps order, scroll position and keyboard focus).
  function refreshValues() {
    if (!root) return;
    U.$$('#hmGrid [data-id]', root).forEach((el) => {
      const id = el.dataset.id, c = NX.market.changeOver(id, st.period), bg = color(c.pct, st.period);
      if (el.classList.contains('hm-tile')) {
        el.style.background = bg;
        el.querySelector('.ch').textContent = U.pct(c.pct);
        el.querySelector('small.num').textContent = ui.fmtPrice(id, c.now) + ' ' + NX.catalog.get(id).quote;
      } else {
        const cells = el.querySelectorAll('td'); cells[1].textContent = ui.fmtPrice(id, c.now);
        const b = cells[2].querySelector('.status'); b.style.background = bg; b.textContent = U.pct(c.pct);
      }
    });
    const side = U.$('#hmSide', root);
    if (side && !side.contains(document.activeElement)) renderSide(data());
  }
  function full() {
    root.innerHTML = '<div class="heading"><div><h1>' + t('nav.heatmap') + '</h1><p>' + t('hm.desc') + '</p></div><span id="hmPill">' + ui.marketDataPill() + '</span></div>' +
      '<div id="hmControls">' + controls() + '</div>' +
      '<div class="split side-right" id="hmWrap"><section class="panel" style="padding:10px" id="hmGrid" aria-live="off"></section><aside id="hmSide"></aside></div>' +
      '<p class="muted" style="font-size:11px;margin-top:10px">' + t('hm.method') + ' ' + t('live.hmNote') + '</p>';
    U.$('#hmSort', root).addEventListener('change', (e) => { st.sort = e.target.value; save(); render(); });
    U.$('#hmSearch', root).addEventListener('input', U.debounce((e) => { st.search = e.target.value; render(); }, 120));
    render();
  }
  const save = () => S.set('heatmap', { market: st.market, period: st.period, sort: st.sort, sub: st.sub, view: st.view });

  NX.views = NX.views || {};
  NX.views.heatmap = {
    title: () => t('nav.heatmap'),
    mount(el) {
      root = el;
      const h = S.state.heatmap;
      st = { market: h.market || 'all', period: h.period || '1d', sort: h.sort || 'change_desc', sub: h.sub || 'all', view: h.view || (window.innerWidth < 600 ? 'list' : 'tiles'), search: '' };
      full();
      offs.push(ui.delegate(el, {
        market: (b) => { st.market = b.dataset.v; st.sub = 'all'; save(); full(); },
        sub: (b) => { st.sub = b.dataset.v; save(); full(); },
        period: (b) => { st.period = b.dataset.v; save(); full(); },
        view: (b) => { st.view = b.dataset.v; save(); full(); },
        open: (b) => NX.go(target(b.dataset.id))
      }));
      offs.push(ui.delegate(el, { 'keydown:open': (b, e) => { if (e.key === 'Enter') NX.go(target(b.dataset.id)); } }, ['keydown']));
      offs.push(NX.api.market.subscribe(U.debounce(refreshValues, 50)));
      offs.push(NX.bus.on('live:update', U.debounce(() => { const p = U.$('#hmPill', root); if (p) p.innerHTML = ui.marketDataPill(); refreshValues(); }, 200)));
    },
    unmount() { offs.forEach((f) => f()); offs = []; st = null; root = null; }
  };
})(window.NX);
