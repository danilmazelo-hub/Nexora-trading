/* NEXORA live market data (optional layer over the simulator).

   With the local gateway (python tools/serve.py) every market section has a PRIMARY API and
   BACKUP APIs with automatic failover, metrics and a configurable order (tools/providers.py):
     crypto      CoinGecko → Binance → OKX
     stocks      Twelve Data → Yahoo Finance
     forex       Twelve Data → Yahoo Finance → Frankfurter (ECB)
     metals      Twelve Data → Yahoo Finance
     indices     Yahoo Finance
     commodities Yahoo Finance history + simulator (demo trade price, clearly marked "SIM")
   Order book (crypto): Binance → OKX through the gateway, Binance directly without it.
   Without the gateway (static hosting / standalone file) crypto still works directly from the
   browser: CoinGecko → Binance. Anything without live data uses the simulator ("SIM" in the UI).
   NX.market consults this module, so quotes, charts, heatmap, order execution and position
   valuation always use the same price. */
(function (NX) {
  'use strict';
  const DAY = 86400000;

  const CG_IDS = {
    'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'BNB/USD': 'binancecoin', 'XRP/USD': 'ripple', 'ADA/USD': 'cardano',
    'DOGE/USD': 'dogecoin', 'AVAX/USD': 'avalanche-2', 'DOT/USD': 'polkadot', 'LINK/USD': 'chainlink', 'TRX/USD': 'tron', 'LTC/USD': 'litecoin',
    'BCH/USD': 'bitcoin-cash', 'ETC/USD': 'ethereum-classic', 'XLM/USD': 'stellar', 'NEAR/USD': 'near', 'ICP/USD': 'internet-computer',
    'APT/USD': 'aptos', 'SUI/USD': 'sui', 'ATOM/USD': 'cosmos', 'ALGO/USD': 'algorand', 'HBAR/USD': 'hedera-hashgraph', 'VET/USD': 'vechain',
    'TIA/USD': 'celestia', 'SEI/USD': 'sei-network', 'TAO/USD': 'bittensor', 'HYPE/USD': 'hyperliquid', 'DASH/USD': 'dash', 'UNI/USD': 'uniswap',
    'AAVE/USD': 'aave', 'INJ/USD': 'injective-protocol', 'ONDO/USD': 'ondo-finance', 'ENA/USD': 'ethena', 'CRV/USD': 'curve-dao-token',
    'JUP/USD': 'jupiter-exchange-solana', 'PENDLE/USD': 'pendle', 'LDO/USD': 'lido-dao', 'ZRO/USD': 'layerzero', 'ARB/USD': 'arbitrum',
    'OP/USD': 'optimism', 'POL/USD': 'polygon-ecosystem-token', 'PEPE/USD': 'pepe', 'WIF/USD': 'dogwifcoin', 'TRUMP/USD': 'official-trump',
    'PUMP/USD': 'pump-fun', 'FET/USD': 'fetch-ai', 'RENDER/USD': 'render-token', 'FIL/USD': 'filecoin', 'WLD/USD': 'worldcoin-wld', 'ORDI/USD': 'ordinals'
  };
  const SECTIONS = ['crypto', 'stocks', 'forex', 'metals', 'indices', 'commodities'];
  const TF_MS = { '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': DAY, '1w': 7 * DAY };
  const CANDLE_TTL = { '5m': 60000, '15m': 120000, '1h': 300000, '4h': 600000, '1d': 1800000, '1w': 3600000 };
  const FRESH_MS = 15 * 60000;   // older quotes fall back to the simulator

  const L = {
    mode: 'off',                 // 'gateway' | 'direct' | 'off'
    status: { gateway: null, lastError: null },
    quotes: {}, periods: {}, candles: {}, candleSrc: {}, inflight: {}, focusId: null, wanted: [], started: false,
    unresolved: {},              // section -> ids no provider could serve (stay simulated)
    direct: {}                   // direct-mode metrics per provider (standalone)
  };

  L.sectionOf = (id) => { const i = NX.catalog.get(id); if (!i) return null; return i.market === 'commodities' ? (i.sub === 'metals' ? 'metals' : 'commodities') : i.market; };
  L.enabled = () => NX.store.state.liveData !== false && L.mode !== 'off';
  L.source = (id) => {
    if (!L.enabled()) return null;
    if (L.mode === 'direct') return CG_IDS[id] ? 'direct' : null;
    return L.sectionOf(id);
  };
  L.quote = (id) => { const q = L.quotes[id]; return q && L.enabled() && Date.now() - q.fetchedAt < FRESH_MS ? q : null; };
  L.isLive = (id) => !!L.quote(id);
  L.isSim = (id) => !!(L.quote(id) || {}).simulated;
  // Scale factor simulator → real level for simulated (commodity) prices at time t.
  L.simK = (id, t) => {
    const q = L.quotes[id]; if (!q) return 1;
    if (!q.simulated) return q.k;
    const u = Math.min(1, Math.max(0, (t - q.kt) / 600000));
    return q.k0 + (q.k1 - q.k0) * u;
  };

  function timeout(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
  async function getJson(url, ms, init) {
    const r = await fetch(url, Object.assign({ signal: timeout(ms || 15000), cache: 'no-store' }, init || {}));
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.code || ('http_' + r.status)); e.status = r.status; throw e; }
    return body;
  }
  const note = (e) => { L.status.lastError = (e && e.message) || String(e); NX.bus.emit('live:status', L.status); };
  // Direct-mode metrics (the gateway keeps its own, more complete metrics).
  async function measured(provider, fn) {
    const m = L.direct[provider] = L.direct[provider] || { calls: 0, ok: 0, fail: 0, lat: [], lastError: null, lastOk: null };
    const t0 = performance.now();
    try { const r = await fn(); m.calls++; m.ok++; m.lastOk = Date.now(); m.lat.push(Math.round(performance.now() - t0)); if (m.lat.length > 100) m.lat.shift(); return r; }
    catch (e) { m.calls++; m.fail++; m.lastError = e.message; m.lat.push(Math.round(performance.now() - t0)); throw e; }
  }

  function setQuote(id, x) {
    const q = Object.assign({}, x, { fetchedAt: Date.now() });
    q.k = q.price / NX.market.simPrice(id, NX.market.now()); // lets the simulator add plausible history at the real level
    if (L.sectionOf(id) === 'commodities') {
      // No free real-time commodity feed: real quotes and candles are the history, the demo trade price
      // comes from the simulator at that level. A new real quote re-anchors it smoothly over 10 minutes.
      const now = NX.market.now();
      q.simulated = true; q.k0 = L.quotes[id] ? L.simK(id, now) : q.k; q.k1 = q.k; q.kt = now;
    }
    L.quotes[id] = q;
    L.periods[id] = x.periods || { '1d': x.changePct };
    patchCandles(id);
  }

  /* ---------- Gateway mode: per-section polling, failover is done by the server ---------- */
  function orderedIds(section) {
    const ids = NX.catalog.all().filter((i) => L.sectionOf(i.id) === section).map((i) => i.id);
    const prio = [L.focusId].concat(L.wanted).filter((id) => id && ids.indexOf(id) >= 0);
    return Array.from(new Set(prio.concat(ids)));   // priority symbols first: the (rate-limited) primary serves them
  }
  async function pollSection(section) {
    try {
      const params = { section, ids: orderedIds(section).join(',') };
      if (L.focusId && L.sectionOf(L.focusId) === section) params.focus = L.focusId;
      const r = await getJson('api/live/quotes?' + new URLSearchParams(params));
      Object.keys(r.quotes).forEach((id) => {
        const x = r.quotes[id];
        setQuote(id, { price: x.price, changePct: x.changePct, high24: x.high24, low24: x.low24, volUsd24: x.volUsd24, t: x.t || Date.now(), marketOpen: x.marketOpen,
          src: x.srcLabel, provider: x.src, fallback: !!x.fallback, official: x.official !== false, periods: x.periods || null });
      });
      L.unresolved[section] = r.unresolved || [];
      L.status.lastError = null;
    } catch (e) { note(e); }
  }
  async function pollAll() {
    if (!L.enabled()) return;
    if (L.mode === 'gateway') await Promise.all(SECTIONS.map(pollSection));
    else if (L.mode === 'direct') await pollDirectCrypto();
    NX.bus.emit('live:update', {});
  }

  /* ---------- Direct mode (no gateway): crypto from the browser, CoinGecko → Binance ---------- */
  async function pollDirectCrypto() {
    const ids = Object.keys(CG_IDS);
    try {
      const list = await measured('coingecko', () => getJson('https://api.coingecko.com/api/v3/coins/markets?' + new URLSearchParams({ vs_currency: 'usd', ids: Object.values(CG_IDS).join(','), per_page: 250, price_change_percentage: '24h,7d,30d,1y' })));
      const by = {}; list.forEach((x) => { by[x.id] = x; });
      ids.forEach((id) => {
        const x = by[CG_IDS[id]]; if (!x || !(x.current_price > 0)) return;
        const pct = x.price_change_percentage_24h_in_currency != null ? x.price_change_percentage_24h_in_currency : x.price_change_percentage_24h;
        setQuote(id, { price: x.current_price, changePct: pct, high24: x.high_24h, low24: x.low_24h, volUsd24: x.total_volume, t: Date.parse(x.last_updated) || Date.now(), marketOpen: true,
          src: 'CoinGecko', provider: 'coingecko', fallback: false, official: true,
          periods: { '1d': pct, '1w': x.price_change_percentage_7d_in_currency, '1m': x.price_change_percentage_30d_in_currency, '1y': x.price_change_percentage_1y_in_currency } });
      });
      L.status.lastError = null;
    } catch (e) {
      note(e);
      try { // backup
        const all = await measured('binance', () => getJson('https://api.binance.com/api/v3/ticker/24hr?type=FULL'));
        const by = {}; all.forEach((x) => { by[x.symbol] = x; });
        ids.forEach((id) => {
          const x = by[id.split('/')[0] + 'USDT']; if (!x || !(+x.lastPrice > 0)) return;
          setQuote(id, { price: +x.lastPrice, changePct: +x.priceChangePercent, high24: +x.highPrice, low24: +x.lowPrice, volUsd24: +x.quoteVolume, t: x.closeTime, marketOpen: true,
            src: 'Binance', provider: 'binance', fallback: true, official: true });
        });
      } catch (e2) { note(e2); }
    }
  }

  /* ---------- Candles ---------- */
  const weekStart = (t) => { const d = Math.floor(t / DAY); return (Math.floor((d + 3) / 7) * 7 - 3) * DAY; };
  const bucket = (t, tf) => (tf === '1w' ? weekStart(t) : Math.floor(t / TF_MS[tf]) * TF_MS[tf]);
  function aggregate(points, tf) {
    const out = []; let cur = null;
    points.forEach(([t, p]) => {
      const b = bucket(t, tf);
      if (!cur || cur.t !== b) { cur = { t: b, o: p, h: p, l: p, c: p, v: 0 }; out.push(cur); }
      if (p > cur.h) cur.h = p; if (p < cur.l) cur.l = p; cur.c = p;
    });
    return out;
  }
  // Repairs one bar: close trusted; an open outside [low, high] is clamped (never stretches the range);
  // close-only bars (o=h=l=c: no intraday range in the feed) become prev-close → close candles instead of dashes.
  function fixBar(o, h, l, c, v, prevClose) {
    if (!(h >= l && l > 0)) { h = Math.max(o, c); l = Math.min(o, c); }
    if (c > h) h = c; if (c < l) l = c;
    o = Math.min(Math.max(o, l), h);
    if (prevClose && o === h && h === l && l === c && prevClose !== c) { o = prevClose; h = Math.max(o, c); l = Math.min(o, c); }
    return [o, h, l, c];
  }
  // Sorted, one candle per bucket (duplicates merged), consistent OHLC — whatever the provider sent.
  function cleanCandles(rows, tf) {
    const out = [];
    rows.filter((x) => x && x.c > 0 && isFinite(x.t)).sort((a, b) => a.t - b.t).forEach((x) => {
      const b = bucket(x.t, tf), last = out[out.length - 1], v = x.v || 0, o0 = x.o > 0 ? x.o : x.c;
      if (last && last.t === b) {
        const r = fixBar(last.o, Math.max(last.h, x.h || 0), Math.min(last.l, x.l || last.l), x.c, last.v + v, null);
        last.o = r[0]; last.h = r[1]; last.l = r[2]; last.c = r[3]; last.v += v;
      } else {
        const r = fixBar(o0, x.h || 0, x.l || 0, x.c, v, last ? last.c : null);
        out.push({ t: b, o: r[0], h: r[1], l: r[2], c: r[3], v });
      }
    });
    return out;
  }
  L.fetchCandles = async (id, tf, limit) => {
    const src = L.source(id); if (!src) return null;
    const key = id + '|' + tf, hit = L.candles[key];
    if (hit && Date.now() - hit.fetchedAt < CANDLE_TTL[tf]) return hit.data;
    if (L.inflight[key]) return L.inflight[key];
    L.inflight[key] = (async () => {
      try {
        let data = null, from = null;
        if (L.mode === 'gateway') {
          const r = await getJson('api/live/candles?' + new URLSearchParams({ section: L.sectionOf(id), id, tf, limit: Math.min(limit || 300, 500) }));
          data = r.candles; from = r.srcLabel ? { label: r.srcLabel, fallback: r.fallback, sparse: !!r.sparse } : null;
        } else {
          // Real OHLC candles from Binance first; CoinGecko's free history is single price points (backup only).
          try {
            const r = await measured('binance', () => getJson('https://api.binance.com/api/v3/klines?' + new URLSearchParams({ symbol: id.split('/')[0] + 'USDT', interval: tf, limit: Math.min(limit || 300, 1000) })));
            data = r.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })); from = { label: 'Binance', fallback: false };
          } catch (e) {
            const days = tf === '5m' || tf === '15m' ? 1 : tf === '1h' || tf === '4h' ? 30 : 365;
            const r = await measured('coingecko', () => getJson('https://api.coingecko.com/api/v3/coins/' + CG_IDS[id] + '/market_chart?vs_currency=usd&days=' + days));
            data = aggregate(r.prices || [], tf); from = { label: 'CoinGecko', fallback: true };
          }
        }
        data = cleanCandles(data || [], tf).slice(-(limit || 400));
        if (data.length < 2) return null;
        L.candles[key] = { data, fetchedAt: Date.now() }; L.candleSrc[key] = from;
        patchCandles(id);
        return L.candles[key].data;
      } catch (e) { note(e); return null; } finally { delete L.inflight[key]; }
    })();
    return L.inflight[key];
  };
  // Keep the last cached candle in line with the newest live quote.
  function patchCandles(id) {
    const q = L.quotes[id]; if (!q || q.simulated) return;   // simulated tails are added by NX.market
    Object.keys(TF_MS).forEach((tf) => {
      const c = L.candles[id + '|' + tf]; if (!c || !c.data.length) return;
      const d = c.data, last = d[d.length - 1];
      if (q.marketOpen === false && q.t < last.t) return;
      const b = bucket(Math.max(q.t, last.t), tf);
      if (b > last.t) d.push({ t: b, o: last.c, h: Math.max(last.c, q.price), l: Math.min(last.c, q.price), c: q.price, v: 0 });
      else { last.c = q.price; if (q.price > last.h) last.h = q.price; if (q.price < last.l) last.l = q.price; }
    });
  }
  L.isSparse = (id, tf) => !!(L.candleSrc[id + '|' + tf] || {}).sparse && !!L.source(id);
  L.cachedCandles = (id, tf) => { const c = L.candles[id + '|' + tf]; return c && L.source(id) ? c.data : null; };
  L.historicPrice = (id, t) => {
    for (const tf of ['5m', '15m', '1h', '4h', '1d', '1w']) {
      const d = L.cachedCandles(id, tf); if (!d || !d.length || t < d[0].t) continue;
      for (let i = d.length - 1; i >= 0; i--) if (d[i].t <= t) return t < d[i].t + TF_MS[tf] ? d[i].c : null;
    }
    return null;
  };

  /* ---------- Order book (crypto) ---------- */
  L.book = {};
  L.hasBook = (id) => L.enabled() && !!CG_IDS[id];
  L.fetchBook = async (id, depth) => {
    if (!L.hasBook(id)) return null;
    depth = depth || 10;
    try {
      let b;
      if (L.mode === 'gateway') {
        const r = await getJson('api/live/book?' + new URLSearchParams({ id, depth }), 6000);
        if (!r.src) return null;
        b = { bids: r.bids, asks: r.asks, src: r.srcLabel, fallback: !!r.fallback, t: r.t };
      } else {
        const r = await measured('binance', () => getJson('https://api.binance.com/api/v3/depth?' + new URLSearchParams({ symbol: id.split('/')[0] + 'USDT', limit: 20 }), 6000));
        const rows = (a) => a.slice(0, depth).map((x) => [+x[0], +x[1]]);
        b = { bids: rows(r.bids), asks: rows(r.asks), src: 'Binance', fallback: false, t: Date.now() };
      }
      b.fetchedAt = Date.now(); L.book[id] = b;
      return b;
    } catch (e) { return null; }
  };

  /* ---------- Views & admin ---------- */
  L.focus = (id) => {
    L.focusId = id;
    const sec = L.sectionOf(id);
    if (L.mode === 'gateway' && L.enabled() && sec && !L.isLive(id)) pollSection(sec).then(() => NX.bus.emit('live:update', {}));
  };
  L.want = (ids) => { L.wanted = (ids || []).slice(0, 12); };
  L.setEnabled = (on) => { NX.store.set('liveData', !!on); NX.bus.emit('live:update', {}); if (on) pollAll(); };
  L.attribution = () => {
    const set = new Set(); Object.keys(L.quotes).forEach((id) => { if (L.isLive(id)) set.add(L.quotes[id].src); });
    return Array.from(set).join(', ');
  };
  L.gatewayStatus = async () => { const s = await getJson('api/live/status', 5000); L.status.gateway = s; return s; };
  L.benchmark = () => getJson('api/live/benchmark', 90000);
  L.saveChain = async (section, chain, disabled) => {
    const s = await getJson('api/live/config', 8000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, chain, disabled }) });
    L.status.gateway = s; await pollSection(section); NX.bus.emit('live:update', {}); return s;
  };
  L.refreshNow = () => pollAll();

  L.init = async () => {
    if (L.started) return; L.started = true;
    try { await L.gatewayStatus(); L.mode = 'gateway'; }
    catch (e) { L.mode = 'direct'; }       // static hosting / standalone file: crypto directly from the browser
    NX.bus.emit('live:status', L.status);
    await pollAll();
    setInterval(pollAll, 60000);
    // The open forex pair is refreshed every 15 s (the gateway spends Twelve Data credits on it first).
    setInterval(() => {
      if (L.mode === 'gateway' && L.enabled() && L.focusId && L.sectionOf(L.focusId) === 'forex' && !document.hidden)
        pollSection('forex').then(() => NX.bus.emit('live:update', {}));
    }, 15000);
  };

  NX.live = L;
})(window.NX);
