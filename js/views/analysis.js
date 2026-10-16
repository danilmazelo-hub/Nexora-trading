/* NEXORA technical analysis: indicators and trend / volatility / support-resistance summary,
   computed from exactly the same candles that the chart displays. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v), S = NX.store;
  const TFS = ['15m', '1h', '4h', '1d', '1w'];
  const LIMITS = { '15m': 400, '1h': 400, '4h': 300, '1d': 365, '1w': 60 };
  let st = null, root = null, offs = [];

  function select() {
    return '<select class="input" id="anSym" style="max-width:300px" aria-label="' + t('an.instrument') + '">' + NX.catalog.MARKETS.map((m) => '<optgroup label="' + t('market.' + m) + '">' +
      NX.catalog.byMarket(m).map((i) => '<option value="' + U.esc(i.id) + '"' + (i.id === st.sym ? ' selected' : '') + '>' + U.esc(i.symbol + ' — ' + i.name) + '</option>').join('') + '</optgroup>').join('') + '</select>';
  }
  function layout() {
    const s = S.state.session, i = NX.catalog.get(st.sym);
    return '<div class="heading"><div><h1>' + t('nav.analysis') + '</h1><p>' + t('an.desc') + '</p></div><div class="actions">' + (s && s.role === 'client' ? '<a class="btn primary" href="#/trade/' + i.market + '?s=' + encodeURIComponent(i.id) + '">' + t('an.trade') + '</a>' : '') + '</div></div>' +
      '<section class="panel" style="margin-bottom:14px"><div class="asset-card"><div class="title">' + ui.badge(i.id, 'lg') + '<div><h2>' + U.esc(i.symbol) + '</h2><small>' + U.esc(i.name) + '</small></div></div>' + select() + '<div class="stats" id="anQuote"></div></div>' +
      '<div class="chart-toolbar"><div class="seg">' + TFS.map((f) => '<button data-act="tf" data-v="' + f + '" class="' + (st.tf === f ? 'active' : '') + '">' + NX.market.TF[f].label + '</button>').join('') + '</div>' +
      '<div class="chips">' + [['sma', 'SMA 20/50'], ['ema', 'EMA 21'], ['bb', 'Bollinger'], ['rsi', 'RSI'], ['macd', 'MACD']].map((x) => '<button class="chip ' + (st.ind[x[0]] ? 'active' : '') + '" data-act="ind" data-v="' + x[0] + '" aria-pressed="' + !!st.ind[x[0]] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<span class="spacer"></span><div class="seg"><button data-act="ctype" data-v="candles" class="' + (st.type === 'candles' ? 'active' : '') + '">' + t('chart.candles') + '</button><button data-act="ctype" data-v="line" class="' + (st.type === 'line' ? 'active' : '') + '">' + t('chart.line') + '</button></div></div>' +
      '<div id="anChart"></div><div class="chart-help"><span id="anPeriod"></span><span>' + t('chart.help') + '</span></div></section>' +
      '<div class="an-cards" id="anCards">' + ui.loading(3) + '</div>' +
      '<p class="notice" style="margin-top:14px">' + t('an.disclaimer') + '</p>';
  }
  function renderQuote() {
    const el = U.$('#anQuote', root); if (!el) return;
    const q = NX.market.quote(st.sym, null, true);
    el.innerHTML = '<div style="width:100%">' + ui.sourceBadge(q) + '</div><div>' + t('col.price') + '<b>' + ui.fmtPrice(st.sym, q.mid) + '</b></div><div>24h<b class="' + U.cls(q.changePct) + '">' + U.pct(q.changePct) + '</b></div><div>' + t('q.high24') + '<b>' + ui.fmtPrice(st.sym, q.high24) + '</b></div><div>' + t('q.low24') + '<b>' + ui.fmtPrice(st.sym, q.low24) + '</b></div>';
  }
  function renderPeriod(ps) {
    const el = U.$('#anPeriod', root); if (!el || !ps) return;
    el.innerHTML = t('chart.period') + ' (' + U.date(ps.from) + ' — ' + U.date(ps.to) + '): <b class="up">H ' + ui.fmtPrice(st.sym, ps.high) + '</b> · <b class="down">L ' + ui.fmtPrice(st.sym, ps.low) + '</b> · <b class="' + U.cls(ps.change) + '">' + U.pct(ps.change) + '</b>';
  }
  function renderCards() {
    const el = U.$('#anCards', root); if (!el || !st.chart) return;
    const c = st.chart.data, sm = NX.ind.summary(c), dec = NX.catalog.get(st.sym).decimals, fp = (v) => v == null ? '—' : U.fmt(v, dec);
    if (sm.n < 30) { el.innerHTML = '<div class="panel" style="grid-column:1/-1">' + ui.empty(t('an.notEnough'), t('an.notEnoughText', { n: sm.n, need: 30 }), 'clock') + '</div>'; return; }
    const trendCls = sm.trend === 'up' ? 'up' : sm.trend === 'down' ? 'down' : '';
    const meter = (v, max, col) => '<div class="meter"><span style="width:' + U.clamp(v / max * 100, 2, 100) + '%;background:' + col + '"></span></div>';
    const volLvl = sm.atrPct < 0.6 ? 'low' : sm.atrPct < 2 ? 'mid' : 'high';
    const rsiTxt = sm.rsi == null ? '—' : sm.rsi >= 70 ? t('an.rsiOver') : sm.rsi <= 30 ? t('an.rsiUnder') : t('an.rsiNeutral');
    const lv = sm.levels;
    const lvRows = (arr, cls) => arr && arr.length ? arr.map((l) => '<div class="lvl"><span class="' + cls + '">' + fp(l.price) + '</span><span class="muted">' + t('an.touches', { n: l.touches }) + '</span></div>').join('') : '<div class="muted" style="padding:6px 0">' + t('an.noLevels') + '</div>';
    el.innerHTML =
      '<div class="panel an-card"><h3>' + U.icon('analysis').replace('<svg', '<svg style="width:16px;height:16px"') + t('an.trend') + '</h3><div class="big ' + trendCls + '">' + t('an.trend.' + sm.trend) + '</div>' +
      '<div class="kv"><span>SMA 20</span><b>' + fp(sm.sma20) + '</b></div><div class="kv"><span>SMA 50</span><b>' + fp(sm.sma50) + '</b></div><div class="kv"><span>' + t('an.slope') + '</span><b class="' + U.cls(sm.slope) + '">' + U.pct(sm.slope) + '</b></div><div class="kv"><span>' + t('an.score') + '</span><b>' + (sm.score > 0 ? '+' : '') + sm.score + ' / 3</b></div>' +
      '<p class="method">' + t('an.trendMethod') + '</p></div>' +
      '<div class="panel an-card"><h3>' + U.icon('alert').replace('<svg', '<svg style="width:16px;height:16px"') + t('an.volatility') + '</h3><div class="big">' + t('an.vol.' + volLvl) + '</div>' +
      '<div class="kv"><span>ATR 14</span><b>' + fp(sm.atr) + ' (' + U.fmt(sm.atrPct, 2) + '%)</b></div>' + meter(sm.atrPct, 4, volLvl === 'high' ? '#ff5c6c' : volLvl === 'mid' ? '#f59e0b' : '#18d27c') +
      '<div class="kv"><span>' + t('an.stdev') + '</span><b>' + U.fmt(sm.stdev, 2) + '%</b></div>' +
      '<div class="kv"><span>RSI 14</span><b>' + (sm.rsi == null ? '—' : U.fmt(sm.rsi, 1)) + ' · ' + rsiTxt + '</b></div>' + (sm.rsi != null ? meter(sm.rsi, 100, '#8b7bff') : '') +
      '<div class="kv"><span>MACD</span><b class="' + U.cls(sm.macdHist) + '">' + (sm.macd == null ? t('chart.notEnough') : fp(sm.macd) + ' / ' + fp(sm.macdSignal)) + '</b></div>' +
      '<p class="method">' + t('an.volMethod') + '</p></div>' +
      '<div class="panel an-card"><h3>' + U.icon('list').replace('<svg', '<svg style="width:16px;height:16px"') + t('an.levels') + '</h3>' +
      (lv ? '<div class="muted" style="font-size:11px;margin-bottom:4px">' + t('an.resistance') + '</div>' + lvRows(lv.resistance.slice().reverse(), 'down') +
        '<div class="lvl" style="border-bottom:1px dashed #2a4a66"><b>' + t('an.current') + '</b><b>' + fp(c[c.length - 1].c) + '</b></div>' +
        '<div class="muted" style="font-size:11px;margin:8px 0 4px">' + t('an.support') + '</div>' + lvRows(lv.support, 'up') : ui.empty(t('an.notEnough'), '', 'clock')) +
      '<p class="method">' + t('an.levelsMethod') + '</p></div>' +
      (!sm.enough ? '<div class="notice warn" style="grid-column:1/-1">' + t('an.limited', { n: sm.n }) + '</div>' : '');
  }
  async function load() {
    const host = U.$('#anChart', root);
    if (!st.chart) st.chart = new NX.Chart(host, { type: st.type, indicators: st.ind, onView: renderPeriod });
    const req = ++st.req, key = st.sym + '|' + st.tf, sym = st.sym, tf = st.tf;
    st.chart.showLoading(key);
    try {
      const data = await NX.api.market.candles(sym, tf, LIMITS[tf]);
      if (!st || req !== st.req) return;
      st.chart.load(key, data, { decimals: NX.catalog.get(sym).decimals, tf });
      st.chartLive = NX.market.isLive(sym);
      renderPeriod(st.chart.periodStats()); renderCards();
    } catch (e) { U.$('#anCards', root).innerHTML = ui.error(e); }
  }
  function remount() { if (st.chart) { st.chart.destroy(); st.chart = null; } root.innerHTML = layout(); bindSelect(); renderQuote(); load(); }
  function bindSelect() { U.$('#anSym', root).addEventListener('change', (e) => { history.replaceState(null, '', '#/analysis?s=' + encodeURIComponent(e.target.value)); st.sym = e.target.value; S.set('terminal.symbol', st.sym); if (NX.live) NX.live.focus(st.sym); remount(); }); }

  NX.views = NX.views || {};
  NX.views.analysis = {
    title: () => t('nav.analysis'),
    mount(el, params) {
      root = el;
      const sv = S.state.terminal;
      st = { sym: params.s && NX.catalog.get(params.s) ? params.s : (NX.catalog.get(sv.symbol) ? sv.symbol : 'BTC/USD'), tf: TFS.indexOf(sv.tf) >= 0 ? sv.tf : '1d', type: sv.chartType, ind: { sma: true, ema: false, bb: true, rsi: true, macd: true }, req: 0 };
      el.innerHTML = layout(); bindSelect(); renderQuote(); load();
      offs.push(ui.delegate(el, {
        tf: (b) => { st.tf = b.dataset.v; U.$$('[data-act=tf]', root).forEach((x) => x.classList.toggle('active', x === b)); load(); },
        ind: (b) => { const k = b.dataset.v; st.ind[k] = !st.ind[k]; b.classList.toggle('active', st.ind[k]); b.setAttribute('aria-pressed', st.ind[k]); st.chart.setIndicators(st.ind); },
        ctype: (b) => { st.type = b.dataset.v; U.$$('[data-act=ctype]', root).forEach((x) => x.classList.toggle('active', x === b)); st.chart.setType(st.type); }
      }));
      if (NX.live) NX.live.focus(st.sym);
      offs.push(NX.bus.on('live:update', () => { if (st && st.chart && st.chart.key && NX.market.isLive(st.sym) !== st.chartLive) load(); }));
      let n = 0;
      offs.push(NX.api.market.subscribe(() => {
        if (!st || !st.chart || st.chart.key !== st.sym + '|' + st.tf) return;
        st.chart.mergeLive(NX.api.market.candlesSync(st.sym, st.tf, 2), st.sym + '|' + st.tf); renderQuote();
        if (++n % 5 === 0) renderCards(); // summary refresh every ~10 s
      }));
    },
    update(params) { if (!st) return false; if (params.s && params.s !== st.sym && NX.catalog.get(params.s)) { st.sym = params.s; remount(); } return true; },
    unmount() { offs.forEach((f) => f()); offs = []; if (st && st.chart) st.chart.destroy(); st = null; root = null; }
  };
})(window.NX);
