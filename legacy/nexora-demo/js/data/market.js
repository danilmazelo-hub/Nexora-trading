/* NEXORA deterministic market simulator — the single source of demo prices.
   Every quote, candle, heatmap value and position valuation is computed from the same
   function price(instrument, time). Nothing is regenerated randomly on open:
   identical time + seed always yields identical prices.

   Model (per instrument, seeded by symbol):
   1. Daily closes: mean-reverting log random walk anchored at the catalogue price on ANCHOR_DAY.
   2. 5-minute slots: Brownian bridge between consecutive daily closes.
   3. Slot high/low: deterministic excursions; 2-second ticks travel open → high/low → close inside the slot.
   Higher timeframes are exact aggregations of 5-minute slots, so all views agree. */
(function (NX) {
  'use strict';
  const U = NX.util;
  const DAY = 86400000, SLOT = 300000, SLOTS = 288, TICK = 2000, TICKS = SLOT / TICK;
  const ANCHOR_DAY = Math.floor(Date.UTC(2026, 9, 15) / DAY); // today's prices ≈ catalogue (original demo) prices
  const HISTORY_DAYS = 420;
  const TF = {
    '5m': { ms: SLOT, label: '5m' }, '15m': { ms: 3 * SLOT, label: '15m' }, '1h': { ms: 12 * SLOT, label: '1H' },
    '4h': { ms: 48 * SLOT, label: '4H' }, '1d': { ms: DAY, label: '1D' }, '1w': { ms: 7 * DAY, label: '1W' }
  };
  const PERIODS = { '1d': DAY, '1w': 7 * DAY, '1m': 30 * DAY, '3m': 91 * DAY, '1y': 365 * DAY };

  let globalSeed = 20261015;
  let clock = { offset: 0, pausedAt: null };
  let spreadOverrides = {};

  const seedCache = {};
  const seedOf = (inst) => seedCache[inst.id] || (seedCache[inst.id] = (U.hashStr(inst.id) ^ globalSeed) >>> 0);
  const kappaOf = (inst) => inst.id === 'VIX' ? 0.08 : inst.market === 'forex' ? 0.02 : 0.012;

  /* ---------- Level 1: daily closes ---------- */
  const daily = {};
  function lnClose(inst, d) {
    let c = daily[inst.id];
    if (!c) c = daily[inst.id] = { fwd: [Math.log(inst.basePrice)], bwd: [Math.log(inst.basePrice)], lnBase: Math.log(inst.basePrice) };
    const s = seedOf(inst), sig = inst.volatility, k = kappaOf(inst);
    if (d >= ANCHOR_DAY) {
      const i = d - ANCHOR_DAY;
      while (c.fwd.length <= i) { const n = c.fwd.length, prev = c.fwd[n - 1]; c.fwd.push(prev + sig * U.normal(s, ANCHOR_DAY + n, 7) - k * (prev - c.lnBase)); }
      return c.fwd[i];
    }
    const i = ANCHOR_DAY - d;
    while (c.bwd.length <= i) { const n = c.bwd.length, next = c.bwd[n - 1]; c.bwd.push(next - sig * U.normal(s, ANCHOR_DAY - n + 1, 7) - k * (next - c.lnBase)); }
    return c.bwd[i];
  }

  /* ---------- Level 2: 5-minute bridge inside a day ---------- */
  const bridges = new Map();
  function dayBridge(inst, d) {
    const key = inst.id + ':' + d;
    let b = bridges.get(key);
    if (b) return b;
    const s = seedOf(inst), sig5 = inst.volatility / Math.sqrt(SLOTS);
    const a = lnClose(inst, d - 1), z = lnClose(inst, d);
    const w = new Float64Array(SLOTS + 1);
    for (let k = 1; k <= SLOTS; k++) w[k] = w[k - 1] + sig5 * U.normal(s, d, 1000 + k);
    b = new Float64Array(SLOTS + 1);
    const drift = w[SLOTS] - (z - a);
    for (let k = 0; k <= SLOTS; k++) b[k] = a + w[k] - (k / SLOTS) * drift;
    b[0] = a; b[SLOTS] = z;
    if (bridges.size > 6000) { let n = 0; for (const kk of bridges.keys()) { bridges.delete(kk); if (++n > 1500) break; } }
    bridges.set(key, b);
    return b;
  }

  /* ---------- Level 3: slot OHLCV and 2-second ticks ---------- */
  function slot(inst, d, k) {
    const s = seedOf(inst), sig5 = inst.volatility / Math.sqrt(SLOTS), b = dayBridge(inst, d);
    const o = Math.exp(b[k]), c = Math.exp(b[k + 1]);
    const h = Math.max(o, c) * Math.exp(Math.abs(U.normal(s, d, 5000 + k)) * sig5 * 0.55);
    const l = Math.min(o, c) * Math.exp(-Math.abs(U.normal(s, d, 6000 + k)) * sig5 * 0.55);
    const hiFirst = U.uniform(s, d, 7000 + k) < 0.5;
    const f1 = 0.12 + 0.33 * U.uniform(s, d, 8000 + k);
    const f2 = f1 + 0.12 + (0.76 - f1) * U.uniform(s, d, 9000 + k);
    const mid = (o + c) / 2;
    const v = inst.liquidityUsd / mid / SLOTS * (0.45 + 1.1 * U.uniform(s, d, 10000 + k)) * (1 + 0.8 * Math.abs(Math.log(c / o)) / sig5);
    return { o, h, l, c, v, hiFirst, f1, f2, d, k };
  }
  function tick(inst, sl, j) {
    if (j <= 0) return sl.o;
    if (j >= TICKS) return sl.c;
    const u = j / TICKS;
    const p1 = sl.hiFirst ? sl.h : sl.l, p2 = sl.hiFirst ? sl.l : sl.h;
    let a0, a1, v0, v1;
    if (u <= sl.f1) { a0 = 0; a1 = sl.f1; v0 = sl.o; v1 = p1; }
    else if (u <= sl.f2) { a0 = sl.f1; a1 = sl.f2; v0 = p1; v1 = p2; }
    else { a0 = sl.f2; a1 = 1; v0 = p2; v1 = sl.c; }
    const p = (u - a0) / (a1 - a0);
    const noise = (sl.h - sl.l) * 0.18 * U.normal(seedOf(inst), sl.d * SLOTS + sl.k, 20000 + j) * Math.sin(Math.PI * p);
    return U.clamp(v0 + (v1 - v0) * p + noise, sl.l, sl.h);
  }
  function locate(t) {
    const d = Math.floor(t / DAY), ms = t - d * DAY, k = Math.floor(ms / SLOT), j = Math.floor((ms - k * SLOT) / TICK);
    return { d, k, j };
  }
  function priceAt(inst, t) { const p = locate(t); return tick(inst, slot(inst, p.d, p.k), p.j); }

  // OHLCV of a 5-minute slot as of time t (partial for the slot containing t).
  function slotCandleAsOf(inst, d, k, t) {
    const sl = slot(inst, d, k), start = d * DAY + k * SLOT;
    if (t >= start + SLOT) return { t: start, o: sl.o, h: sl.h, l: sl.l, c: sl.c, v: sl.v };
    const jNow = Math.max(0, Math.floor((t - start) / TICK));
    let h = sl.o, l = sl.o, c = sl.o;
    for (let j = 1; j <= jNow; j++) { c = tick(inst, sl, j); if (c > h) h = c; if (c < l) l = c; }
    return { t: start, o: sl.o, h, l, c, v: sl.v * (jNow / TICKS) };
  }

  /* ---------- Aggregation ---------- */
  const dayAggCache = new Map();
  function dayAgg(inst, d, t) {
    const dayStart = d * DAY;
    if (t >= dayStart + DAY) {
      const key = inst.id + ':' + d;
      const hit = dayAggCache.get(key);
      if (hit) return hit;
      const r = aggregateSlots(inst, d, 0, SLOTS, t);
      if (dayAggCache.size > 20000) dayAggCache.clear();
      dayAggCache.set(key, r);
      return r;
    }
    return aggregateSlots(inst, d, 0, SLOTS, t);
  }
  function aggregateSlots(inst, d, k0, k1, t) {
    let o = null, h = -Infinity, l = Infinity, c = null, v = 0;
    for (let k = k0; k < k1; k++) {
      const start = d * DAY + k * SLOT;
      if (start > t) break;
      const sc = slotCandleAsOf(inst, d, k, t);
      if (o === null) o = sc.o;
      if (sc.h > h) h = sc.h; if (sc.l < l) l = sc.l; c = sc.c; v += sc.v;
    }
    return o === null ? null : { o, h, l, c, v };
  }
  const weekStartDay = (d) => Math.floor((d + 3) / 7) * 7 - 3; // Monday-aligned (UTC)

  function bucketCandle(inst, tf, start, t) {
    if (tf === '1w') {
      const d0 = start / DAY; let o = null, h = -Infinity, l = Infinity, c = null, v = 0;
      for (let d = d0; d < d0 + 7; d++) {
        if (d * DAY > t) break;
        const a = dayAgg(inst, d, t); if (!a) continue;
        if (o === null) o = a.o; if (a.h > h) h = a.h; if (a.l < l) l = a.l; c = a.c; v += a.v;
      }
      return o === null ? null : { t: start, o, h, l, c, v };
    }
    if (tf === '1d') { const a = dayAgg(inst, start / DAY, t); return a ? Object.assign({ t: start }, a) : null; }
    const d = Math.floor(start / DAY), k0 = Math.round((start - d * DAY) / SLOT), n = TF[tf].ms / SLOT;
    const a = aggregateSlots(inst, d, k0, k0 + n, t);
    return a ? Object.assign({ t: start }, a) : null;
  }

  const candleCache = new Map(); // completed candles: key inst|tf|start
  /* ---------- Quotes ---------- */
  function spreadBps(inst) { const o = spreadOverrides[inst.id]; return o != null ? o : inst.spreadBps; }
  // Live overlay (js/data/live.js): returns the live quote when one is fresh, else null.
  const liveQ = (id) => (NX.live ? NX.live.quote(id) : null);
  const nearNow = (t) => t >= M.now() - 120000;
  // Simulated price at the real level (commodities: real history, simulated demo trade price).
  const simLive = (inst, t) => priceAt(inst, t) * NX.live.simK(inst.id, t);
  // Appends / updates the newest candle with the simulated price so the chart matches the quote.
  function withSimTail(out, inst, tf, t) {
    if (!out.length) return out;
    const ms = TF[tf].ms, b = tf === '1w' ? weekStartDay(Math.floor(t / DAY)) * DAY : Math.floor(t / ms) * ms, p = simLive(inst, t), last = out[out.length - 1];
    if (b > last.t) out.push({ t: b, o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p, v: 0 });
    else if (b === last.t) { last.c = p; if (p > last.h) last.h = p; if (p < last.l) last.l = p; }
    return out;
  }
  // Price at time t: live price "now", cached live candles for the past, otherwise the simulator
  // (scaled to the live price level when a live quote exists).
  function priceOf(inst, t) {
    const lq = liveQ(inst.id);
    if (!lq) return priceAt(inst, t);
    if (nearNow(t)) return lq.simulated ? simLive(inst, t) : lq.price;
    const h = NX.live.historicPrice(inst.id, t);
    return h != null ? h : priceAt(inst, t) * lq.k;
  }
  function simCandles(instId, tf, count, t) {
    const inst = NX.catalog.get(instId); if (!inst || !TF[tf]) return [];
    t = t == null ? M.now() : t;
    const ms = TF[tf].ms;
    let cur = tf === '1w' ? weekStartDay(Math.floor(t / DAY)) * DAY : Math.floor(t / ms) * ms;
    const minStart = (Math.floor(t / DAY) - HISTORY_DAYS) * DAY;
    const out = [];
    for (let i = 0; i < count; i++) {
      const start = cur - i * ms;
      if (start < minStart) break;
      const done = start + ms <= t;
      const key = instId + '|' + tf + '|' + start;
      let c = done ? candleCache.get(key) : null;
      if (!c) { c = bucketCandle(inst, tf, start, t); if (c && done) { if (candleCache.size > 60000) candleCache.clear(); candleCache.set(key, c); } }
      if (c) out.push(c);
    }
    return out.reverse();
  }
  function candles(instId, tf, count, t) {
    const lq = liveQ(instId);
    if (lq && (t == null || nearNow(t))) {
      const live = NX.live.cachedCandles(instId, tf);
      if (live) { const out = live.slice(-count).map((c) => Object.assign({}, c)); return lq.simulated ? withSimTail(out, NX.catalog.get(instId), tf, t == null ? M.now() : t) : out; }
      return simCandles(instId, tf, count, t).map((c) => ({ t: c.t, o: c.o * lq.k, h: c.h * lq.k, l: c.l * lq.k, c: c.c * lq.k, v: c.v / lq.k }));
    }
    return simCandles(instId, tf, count, t);
  }
  function quote(instId, t, detailed) {
    const inst = NX.catalog.get(instId); if (!inst) return null;
    t = t == null ? M.now() : t;
    const lq = liveQ(instId);
    if (lq && lq.simulated && nearNow(t)) {
      // Commodity: simulated demo price around the real level; change vs the real previous close.
      const mid = simLive(inst, t), known = lq.changePct != null && isFinite(lq.changePct), prev = known ? lq.price / (1 + lq.changePct / 100) : null, half = mid * spreadBps(inst) / 2 / 10000;
      return { id: inst.id, t, mid, bid: mid - half, ask: mid + half, prevClose: prev, change: known ? mid - prev : null, periodKey: 'session', changePct: known ? (mid / prev - 1) * 100 : null,
        high24: lq.high24 > 0 ? Math.max(lq.high24, mid) : null, low24: lq.low24 > 0 ? Math.min(lq.low24, mid) : null, volumeUsd24: lq.volUsd24, volume24: lq.volUsd24 / mid,
        live: { src: lq.src, provider: lq.provider, fallback: !!lq.fallback, official: lq.official !== false, at: lq.t, fetchedAt: lq.fetchedAt, marketOpen: lq.marketOpen, simulated: true } };
    }
    if (lq && nearNow(t)) {
      const mid = lq.price, known = lq.changePct != null && isFinite(lq.changePct), prev = known ? mid / (1 + lq.changePct / 100) : null, half = mid * spreadBps(inst) / 2 / 10000;
      return { id: inst.id, t, mid, bid: mid - half, ask: mid + half, prevClose: prev, change: known ? mid - prev : null, periodKey: inst.market === 'crypto' ? '24h' : 'session', changePct: lq.changePct != null && isFinite(lq.changePct) ? lq.changePct : null,
        high24: lq.high24, low24: lq.low24, volumeUsd24: lq.volUsd24, volume24: lq.volUsd24 / mid,
        live: { src: lq.src, provider: lq.provider, fallback: !!lq.fallback, official: lq.official !== false, at: lq.t, fetchedAt: lq.fetchedAt, marketOpen: lq.marketOpen } };
    }
    const mid = priceAt(inst, t), prev = priceAt(inst, t - DAY);
    const half = mid * spreadBps(inst) / 2 / 10000;
    const q = { id: inst.id, t, mid, bid: mid - half, ask: mid + half, prevClose: prev, change: mid - prev, changePct: (mid / prev - 1) * 100 };
    if (detailed) {
      let h = -Infinity, l = Infinity, v = 0;
      const p = locate(t);
      for (let i = 0; i < SLOTS; i++) {
        let d = p.d, k = p.k - i; while (k < 0) { k += SLOTS; d -= 1; }
        const sc = slotCandleAsOf(inst, d, k, t);
        if (sc.h > h) h = sc.h; if (sc.l < l) l = sc.l; v += sc.v;
      }
      q.high24 = h; q.low24 = l; q.volume24 = v; q.volumeUsd24 = v * mid;
    }
    return q;
  }
  function changeOver(instId, period, t) {
    const inst = NX.catalog.get(instId); if (!inst) return null;
    t = t == null ? M.now() : t;
    const lq = liveQ(instId), lp = lq && !lq.simulated && nearNow(t) && NX.live.periods[instId] ? NX.live.periods[instId][period] : null;
    if (lp != null && isFinite(lp)) return { now: lq.price, then: lq.price / (1 + lp / 100), pct: lp, live: true };
    const now = priceOf(inst, t), then = priceOf(inst, t - (PERIODS[period] || DAY));
    return { now, then, pct: (now / then - 1) * 100 };
  }
  // Converts an amount in currency `ccy` into USD at the current (live or simulated) rate.
  function toUsd(amount, ccy, t) {
    if (!ccy || ccy === 'USD') return amount;
    const p = NX.catalog.usdPairFor(ccy); if (!p) return amount;
    const m = priceOf(NX.catalog.get(p.id), t == null ? M.now() : t);
    return p.invert ? amount / m : amount * m;
  }

  /* ---------- Simulation clock & single ticker ---------- */
  let timer = null;
  const M = {
    TF, PERIODS, DAY, SLOT, TICK, HISTORY_DAYS,
    configure(cfg) {
      if (cfg.seed != null && cfg.seed !== globalSeed) { globalSeed = cfg.seed; Object.keys(seedCache).forEach((k) => delete seedCache[k]); Object.keys(daily).forEach((k) => delete daily[k]); bridges.clear(); dayAggCache.clear(); candleCache.clear(); }
      if (cfg.clock) clock = Object.assign({ offset: 0, pausedAt: null }, cfg.clock);
      if (cfg.spreads) spreadOverrides = cfg.spreads;
    },
    getClock: () => Object.assign({}, clock),
    now: () => (clock.pausedAt != null ? clock.pausedAt : Date.now() - (clock.offset || 0)),
    isPaused: () => clock.pausedAt != null,
    pause() { if (clock.pausedAt == null) clock.pausedAt = M.now(); NX.bus.emit('market:clock', M.getClock()); return M.getClock(); },
    resume() { if (clock.pausedAt != null) { clock.offset = Date.now() - clock.pausedAt; clock.pausedAt = null; } NX.bus.emit('market:clock', M.getClock()); M.emitTick(); return M.getClock(); },
    start() { if (timer) return; timer = setInterval(() => { if (!M.isPaused() && !document.hidden) M.emitTick(); }, TICK); },
    stop() { clearInterval(timer); timer = null; },
    emitTick() { NX.bus.emit('market:tick', { t: M.now() }); },
    price: (instId, t) => { const i = NX.catalog.get(instId); return i ? priceOf(i, t == null ? M.now() : t) : null; },
    simPrice: (instId, t) => { const i = NX.catalog.get(instId); return i ? priceAt(i, t == null ? M.now() : t) : null; },
    isLive: (instId) => !!liveQ(instId),
    isSim: (instId) => { const q = liveQ(instId); return !!(q && q.simulated); },
    quote, candles, changeOver, toUsd, spreadBps: (id) => spreadBps(NX.catalog.get(id))
  };
  NX.market = M;
})(window.NX);
