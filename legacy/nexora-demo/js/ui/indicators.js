/* NEXORA technical indicators — computed from exactly the candles shown on the chart.
   All functions return arrays aligned with the input (null where not enough data). */
(function (NX) {
  'use strict';
  const I = {};

  I.sma = (vals, n) => {
    const out = new Array(vals.length).fill(null); let s = 0;
    for (let i = 0; i < vals.length; i++) { s += vals[i]; if (i >= n) s -= vals[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  };
  I.ema = (vals, n) => {
    const out = new Array(vals.length).fill(null); if (vals.length < n) return out;
    const k = 2 / (n + 1); let e = 0;
    for (let i = 0; i < n; i++) e += vals[i];
    e /= n; out[n - 1] = e;
    for (let i = n; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); out[i] = e; }
    return out;
  };
  // Wilder's RSI
  I.rsi = (vals, n) => {
    n = n || 14; const out = new Array(vals.length).fill(null); if (vals.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = vals[i] - vals[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  };
  I.macd = (vals, f, s, sig) => {
    f = f || 12; s = s || 26; sig = sig || 9;
    const ef = I.ema(vals, f), es = I.ema(vals, s);
    const line = vals.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const start = line.findIndex((v) => v != null);
    const signal = new Array(vals.length).fill(null);
    if (start >= 0) { const e = I.ema(line.slice(start), sig); e.forEach((v, i) => { signal[start + i] = v; }); }
    const hist = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
    return { line, signal, hist };
  };
  I.bollinger = (vals, n, k) => {
    n = n || 20; k = k || 2;
    const mid = I.sma(vals, n), up = new Array(vals.length).fill(null), lo = new Array(vals.length).fill(null);
    for (let i = n - 1; i < vals.length; i++) {
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += (vals[j] - mid[i]) * (vals[j] - mid[i]);
      const sd = Math.sqrt(s / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
    }
    return { mid, up, lo };
  };
  I.atr = (c, n) => {
    n = n || 14; const tr = c.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c))));
    const out = new Array(c.length).fill(null); if (c.length <= n) return out;
    let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; out[n] = a;
    for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  };

  /* Support / resistance: swing highs/lows (fractal of `w` bars on each side) clustered within
     0.6 × ATR; levels with more touches rank higher. Returns nearest levels below/above price. */
  I.levels = (c, w) => {
    w = w || 3;
    if (c.length < 2 * w + 10) return null;
    const atr = I.atr(c, 14); const a = atr[atr.length - 1] || (c[c.length - 1].c * 0.01);
    const piv = [];
    for (let i = w; i < c.length - w; i++) {
      let hi = true, lo = true;
      for (let j = i - w; j <= i + w; j++) { if (j === i) continue; if (c[j].h >= c[i].h) hi = false; if (c[j].l <= c[i].l) lo = false; }
      if (hi) piv.push({ p: c[i].h, i }); if (lo) piv.push({ p: c[i].l, i });
    }
    piv.sort((x, y) => x.p - y.p);
    const clusters = [];
    piv.forEach((x) => { const last = clusters[clusters.length - 1]; if (last && x.p - last.max <= a * 0.6) { last.pts.push(x); last.max = x.p; } else clusters.push({ pts: [x], max: x.p }); });
    const price = c[c.length - 1].c;
    const lv = clusters.map((cl) => ({ price: cl.pts.reduce((s, x) => s + x.p, 0) / cl.pts.length, touches: cl.pts.length, last: Math.max(...cl.pts.map((x) => x.i)) }));
    const sup = lv.filter((l) => l.price < price).sort((x, y) => y.price - x.price).slice(0, 3);
    const res = lv.filter((l) => l.price > price).sort((x, y) => x.price - y.price).slice(0, 3);
    return { support: sup, resistance: res, atr: a };
  };

  /* Trend & volatility summary used by the analysis view. */
  I.summary = (c) => {
    const n = c.length;
    const res = { enough: n >= 60, n };
    if (n < 30) return res;
    const close = c.map((x) => x.c);
    const s20 = I.sma(close, 20), s50 = I.sma(close, Math.min(50, n - 1));
    const last = close[n - 1], a = s20[n - 1], b = s50[n - 1];
    const slope = s20[n - 1] != null && s20[n - 6] != null ? (s20[n - 1] / s20[n - 6] - 1) * 100 : 0;
    let score = 0;
    if (last > a) score++; else score--;
    if (a > b) score++; else score--;
    if (slope > 0.2) score++; else if (slope < -0.2) score--;
    res.trend = score >= 2 ? 'up' : score <= -2 ? 'down' : 'side';
    res.score = score; res.sma20 = a; res.sma50 = b; res.slope = slope;
    const rets = []; for (let i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(close[i] / close[i - 1]));
    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    res.stdev = Math.sqrt(rets.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, rets.length - 1)) * 100;
    const atr = I.atr(c, 14); res.atr = atr[n - 1]; res.atrPct = res.atr / last * 100;
    const r = I.rsi(close, 14); res.rsi = r[n - 1];
    const m = I.macd(close); res.macd = m.line[n - 1]; res.macdSignal = m.signal[n - 1]; res.macdHist = m.hist[n - 1];
    res.levels = I.levels(c);
    return res;
  };

  NX.ind = I;
})(window.NX);
