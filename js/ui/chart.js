/* NEXORA interactive canvas chart.
   Candles / line, zoom (wheel, buttons, pinch), pan (drag, swipe), crosshair with OHLCV tooltip,
   high/low of the visible period, SMA/EMA/Bollinger overlays, RSI and MACD panes.
   Mouse, touch (pointer events) and keyboard are supported. */
(function (NX) {
  'use strict';
  const U = NX.util, IND = NX.ind, t = (k, v) => NX.i18n.t(k, v);
  const C = { up: '#18d27c', down: '#ff5c6c', grid: 'rgba(120,150,185,0.10)', axis: '#7e91ab', text: '#c9d8e8', cross: 'rgba(210,225,240,0.55)',
    sma20: '#f5c04a', sma50: '#8b7bff', ema: '#19c2ff', bb: 'rgba(25,194,255,0.55)', bbFill: 'rgba(25,194,255,0.06)', line: '#19c2ff', vol: 'rgba(110,150,190,0.28)' };
  const AXIS_W = 70, TIME_H = 24, PANE_H = 88, GAP = 6;

  function niceStep(range, count) {
    const raw = range / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  class Chart {
    constructor(el, opts) {
      opts = opts || {};
      this.el = el; this.opts = opts; el.__nxChart = this; // handle for debugging / automated checks
      this.data = []; this.type = opts.type || 'candles'; this.decimals = 2; this.tf = '1h';
      this.ind = Object.assign({ sma: true, ema: false, bb: false, rsi: false, macd: false }, opts.indicators || {});
      this.view = { end: 0, span: 90 };
      this.cross = null; this.pointers = new Map(); this.gesture = null;
      el.classList.add('chart-box');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'img');
      el.innerHTML = '<canvas></canvas><div class="chart-legend"></div><div class="chart-tip" hidden></div><div class="sr-only" aria-live="polite"></div>';
      this.cv = el.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
      this.tip = el.querySelector('.chart-tip'); this.legend = el.querySelector('.chart-legend'); this.live = el.querySelector('.sr-only');
      this._bind();
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(el);
      this._resize();
    }
    destroy() { this.ro.disconnect(); this._unbind(); this.el.innerHTML = ''; }

    /* ---------- data ---------- */
    setData(candles, o) {
      o = o || {};
      const wasAtEnd = this.data.length === 0 || this.view.end >= this.data.length - 1.5;
      const grew = candles.length - this.data.length;
      this.data = candles;
      if (o.decimals != null) this.decimals = o.decimals;
      if (o.tf) this.tf = o.tf;
      if (o.reset || !this._inited) { this.resetView(); this._inited = true; }
      else if (wasAtEnd && grew > 0) this.view.end += grew; // keep following the live edge
      this._calc();
      this._clampView();
      this.draw();
    }
    /* `key` identifies which instrument|timeframe the loaded data belongs to.
       Live ticks are merged only when the key matches, so a tick that arrives while another
       instrument is loading can never mix two price series. */
    showLoading(key) { this.key = null; this.pendingKey = key; this.data = []; this.cross = null; this.msg = 'state.loading'; this._hideTip(); this.draw(); }
    load(key, candles, o) { if (this.pendingKey && key !== this.pendingKey) return false; this.key = key; this.pendingKey = null; this.msg = null; this.setData(candles, Object.assign({ reset: true }, o)); return true; }
    // Merge the latest candles from a live tick (replace the forming candle / append new ones).
    mergeLive(latest, key) {
      if (key != null && key !== this.key) return;
      if (!this.data.length || !latest.length) return;
      const d = this.data.slice(), lastT = d[d.length - 1].t;
      latest.forEach((c) => {
        if (c.t === lastT || c.t === d[d.length - 1].t) d[d.length - 1] = c;
        else if (c.t > d[d.length - 1].t) d.push(c);
        else { const i = d.findIndex((x) => x.t === c.t); if (i >= 0) d[i] = c; }
      });
      this.setData(d);
    }
    setType(type) { this.type = type; this.draw(); }
    setIndicators(ind) { this.ind = Object.assign({}, this.ind, ind); this._resize(); }
    resetView() { const n = this.data.length; this.view.span = Math.min(Math.max(30, Math.round(this.plotW() / 9)), Math.max(20, n)); this.view.end = n - 1 + this._rightPad(); this._clampView(); }
    _rightPad() { return Math.max(1, this.view.span * 0.06); }
    zoom(f, anchorIdx) {
      const v = this.view, n = this.data.length; if (!n) return;
      const a = anchorIdx == null ? v.end - v.span / 2 : anchorIdx;
      const ns = U.clamp(v.span * f, 12, Math.max(12, n + 10));
      v.end = a + (v.end - a) * (ns / v.span); v.span = ns;
      this._clampView(); this.draw(); this._emitView();
    }
    pan(dIdx) { this.view.end += dIdx; this._clampView(); this.draw(); this._emitView(); }
    _clampView() {
      const v = this.view, n = this.data.length; if (!n) return;
      v.span = U.clamp(v.span, 12, Math.max(12, n + 10));
      v.end = U.clamp(v.end, Math.min(n - 1, v.span * 0.35), n - 1 + v.span * 0.35);
    }
    visibleRange() {
      const v = this.view, n = this.data.length;
      const i0 = Math.max(0, Math.floor(v.end - v.span + 1)), i1 = Math.min(n - 1, Math.ceil(v.end));
      return { i0, i1 };
    }
    // Stats of the visible period (used for the "period high / low" display).
    periodStats() {
      const { i0, i1 } = this.visibleRange(); if (i1 < i0) return null;
      let hi = -Infinity, lo = Infinity, hiI = i0, loI = i0, vol = 0;
      for (let i = i0; i <= i1; i++) { const c = this.data[i]; if (c.h > hi) { hi = c.h; hiI = i; } if (c.l < lo) { lo = c.l; loI = i; } vol += c.v; }
      const first = this.data[i0], last = this.data[i1];
      return { high: hi, low: lo, highAt: this.data[hiI].t, lowAt: this.data[loI].t, from: first.t, to: last.t, change: (last.c / first.o - 1) * 100, volume: vol, count: i1 - i0 + 1 };
    }
    _emitView() { if (this.opts.onView) { clearTimeout(this._vt); this._vt = setTimeout(() => this.opts.onView(this.periodStats()), 60); } }
    _calc() {
      const cl = this.data.map((c) => c.c);
      this.calc = {
        sma20: IND.sma(cl, 20), sma50: IND.sma(cl, 50), ema21: IND.ema(cl, 21),
        bb: IND.bollinger(cl, 20, 2), rsi: IND.rsi(cl, 14), macd: IND.macd(cl, 12, 26, 9)
      };
    }

    /* ---------- layout ---------- */
    _resize() {
      const r = this.el.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(200, r.width); this.h = Math.max(160, r.height); this.dpr = dpr;
      this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }
    plotW() { return Math.max(50, (this.w || 600) - AXIS_W); }
    _layout() {
      const panes = (this.ind.rsi ? 1 : 0) + (this.ind.macd ? 1 : 0);
      const ph = this.h < 380 ? 66 : PANE_H;
      const mainH = this.h - TIME_H - panes * (ph + GAP);
      const L = { main: { top: 24, h: mainH - 24 }, panes: [] }; // top gap keeps the legend clear of candles
      let y = mainH + GAP;
      if (this.ind.rsi) { L.rsi = { top: y, h: ph }; y += ph + GAP; }
      if (this.ind.macd) { L.macd = { top: y, h: ph }; y += ph + GAP; }
      L.timeY = this.h - TIME_H;
      return L;
    }
    _x(i) { const v = this.view, cw = this.plotW() / v.span; return (i - (v.end - v.span + 1) + 0.5) * cw; }
    _idxAt(x) { const v = this.view, cw = this.plotW() / v.span; return Math.round(x / cw - 0.5 + (v.end - v.span + 1)); }

    /* ---------- drawing ---------- */
    draw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
    }
    _draw() {
      const ctx = this.ctx, W = this.w, H = this.h, pw = this.plotW();
      ctx.clearRect(0, 0, W, H);
      ctx.font = '11px Inter, system-ui, sans-serif';
      if (this.data.length < 2) {
        ctx.fillStyle = C.axis; ctx.textAlign = 'center'; ctx.fillText(t(this.msg || 'chart.noData'), W / 2, H / 2);
        this.el.setAttribute('aria-label', t(this.msg || 'chart.noData'));
        return;
      }
      const L = this._layout(), { i0, i1 } = this.visibleRange(), d = this.data, cw = pw / this.view.span;
      // price range
      let lo = Infinity, hi = -Infinity, vmax = 0;
      for (let i = i0; i <= i1; i++) {
        const c = d[i]; if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; if (c.v > vmax) vmax = c.v;
        if (this.ind.bb && this.calc.bb.up[i] != null) { hi = Math.max(hi, this.calc.bb.up[i]); lo = Math.min(lo, this.calc.bb.lo[i]); }
      }
      const pad = (hi - lo) * 0.08 || hi * 0.01; hi += pad; lo -= pad;
      const M = L.main, y = (p) => M.top + (hi - p) / (hi - lo) * M.h;
      this._scale = { y, hi, lo, M, L };

      // grid + price axis
      ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.fillStyle = C.axis; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const step = niceStep(hi - lo, Math.max(3, Math.floor(M.h / 60)));
      for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
        const yy = Math.round(y(p)) + 0.5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke();
        ctx.fillText(U.fmt(p, this.decimals), pw + 6, yy);
      }
      // time axis
      const minPx = 90, every = Math.max(1, Math.ceil(minPx / cw));
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = i0; i <= i1; i++) {
        if (i % every) continue; const xx = Math.round(this._x(i)) + 0.5;
        ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(xx, M.top); ctx.lineTo(xx, L.timeY); ctx.stroke();
        ctx.fillStyle = C.axis; ctx.fillText(this._fmtTime(d[i].t, true), xx, L.timeY + 6);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, L.timeY); ctx.clip();
      // volume (bottom 18% of the main pane)
      if (vmax > 0) {
        const vh = M.h * 0.18;
        for (let i = i0; i <= i1; i++) {
          const c = d[i], hh = c.v / vmax * vh; ctx.fillStyle = c.c >= c.o ? 'rgba(24,210,124,0.22)' : 'rgba(255,92,108,0.22)';
          ctx.fillRect(this._x(i) - cw * 0.35, M.top + M.h - hh, Math.max(1, cw * 0.7), hh);
        }
      }
      // Bollinger fill
      if (this.ind.bb) {
        const bb = this.calc.bb; ctx.beginPath(); let started = false;
        for (let i = i0; i <= i1; i++) { if (bb.up[i] == null) continue; const xx = this._x(i); if (!started) { ctx.moveTo(xx, y(bb.up[i])); started = true; } else ctx.lineTo(xx, y(bb.up[i])); }
        for (let i = i1; i >= i0; i--) { if (bb.lo[i] == null) continue; ctx.lineTo(this._x(i), y(bb.lo[i])); }
        if (started) { ctx.fillStyle = C.bbFill; ctx.fill(); }
        this._line(bb.up, i0, i1, y, C.bb, 1); this._line(bb.lo, i0, i1, y, C.bb, 1); this._line(bb.mid, i0, i1, y, C.bb, 1, [4, 4]);
      }
      // series
      if (this.type === 'line') {
        ctx.beginPath();
        for (let i = i0; i <= i1; i++) { const xx = this._x(i), yy = y(d[i].c); if (i === i0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
        ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
        ctx.lineTo(this._x(i1), M.top + M.h); ctx.lineTo(this._x(i0), M.top + M.h); ctx.closePath();
        const g = ctx.createLinearGradient(0, M.top, 0, M.top + M.h); g.addColorStop(0, 'rgba(25,194,255,0.22)'); g.addColorStop(1, 'rgba(25,194,255,0)');
        ctx.fillStyle = g; ctx.fill();
      } else {
        const bw = Math.max(1, Math.min(18, cw * 0.68));
        for (let i = i0; i <= i1; i++) {
          const c = d[i], xx = Math.round(this._x(i)) + 0.5, up = c.c >= c.o, col = up ? C.up : C.down;
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xx, y(c.h)); ctx.lineTo(xx, y(c.l)); ctx.stroke();
          const yo = y(c.o), yc = y(c.c), top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
          ctx.fillRect(xx - bw / 2, top, bw, bh);
        }
      }
      if (this.ind.sma) { this._line(this.calc.sma20, i0, i1, y, C.sma20, 1.4); this._line(this.calc.sma50, i0, i1, y, C.sma50, 1.4); }
      if (this.ind.ema) this._line(this.calc.ema21, i0, i1, y, C.ema, 1.4);
      // period high / low markers
      const st = this.periodStats();
      if (st) {
        const useClose = this.type === 'line';
        let hiI = i0, loI = i0;
        for (let i = i0; i <= i1; i++) {
          if ((useClose ? d[i].c : d[i].h) > (useClose ? d[hiI].c : d[hiI].h)) hiI = i;
          if ((useClose ? d[i].c : d[i].l) < (useClose ? d[loI].c : d[loI].l)) loI = i;
        }
        this._marker(hiI, useClose ? d[hiI].c : d[hiI].h, y, true);
        this._marker(loI, useClose ? d[loI].c : d[loI].l, y, false);
      }
      ctx.restore();
      // last price line + label
      const last = d[d.length - 1], ly = y(last.c);
      if (ly >= M.top && ly <= M.top + M.h) {
        const col = last.c >= last.o ? C.up : C.down;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Math.round(ly) + 0.5); ctx.lineTo(pw, Math.round(ly) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        this._axisLabel(ly, U.fmt(last.c, this.decimals), col, '#fff');
      }
      // indicator panes
      if (L.rsi) this._paneRsi(L.rsi, i0, i1);
      if (L.macd) this._paneMacd(L.macd, i0, i1);
      // crosshair
      if (this.cross && this.cross.i >= i0 && this.cross.i <= i1) this._drawCross(L, y);
      else this._hideTip();
      this._legendUpdate(this.cross ? this.cross.i : d.length - 1);
      const lastText = t('chart.aria', { price: U.fmt(last.c, this.decimals), hi: st ? U.fmt(st.high, this.decimals) : '—', lo: st ? U.fmt(st.low, this.decimals) : '—' });
      this.el.setAttribute('aria-label', lastText);
    }
    _line(arr, i0, i1, y, color, w, dash) {
      const ctx = this.ctx; ctx.beginPath(); let s = false;
      for (let i = i0; i <= i1; i++) { if (arr[i] == null) { s = false; continue; } const xx = this._x(i), yy = y(arr[i]); if (!s) { ctx.moveTo(xx, yy); s = true; } else ctx.lineTo(xx, yy); }
      ctx.strokeStyle = color; ctx.lineWidth = w || 1; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }
    _marker(i, p, y, isHigh) {
      const ctx = this.ctx, xx = this._x(i), yy = y(p), label = (isHigh ? 'H ' : 'L ') + U.fmt(p, this.decimals);
      ctx.fillStyle = '#f7fcff'; ctx.strokeStyle = isHigh ? '#19c2ff' : '#f4ae59'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xx, yy, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 10, pw = this.plotW();
      let lx = U.clamp(xx - tw / 2, 2, pw - tw - 2), ly = isHigh ? yy - 22 : yy + 7;
      if (ly < 22) ly = yy + 7; if (ly + 16 > this._scale.M.top + this._scale.M.h) ly = yy - 22;
      ctx.fillStyle = 'rgba(16,41,63,0.95)'; ctx.strokeStyle = isHigh ? '#2b7aa3' : '#8a6532'; ctx.lineWidth = 1;
      this._rr(lx, ly, tw, 16, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#eaf7ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + 5, ly + 8.5);
      ctx.font = '11px Inter, system-ui, sans-serif';
    }
    _rr(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    _axisLabel(yy, text, bg, fg) {
      const ctx = this.ctx, pw = this.plotW();
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      const h = 18; ctx.fillStyle = bg; this._rr(pw + 1, yy - h / 2, AXIS_W - 3, h, 3); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, pw + 5, yy + 0.5);
      ctx.font = '11px Inter, system-ui, sans-serif';
    }
    _paneFrame(P, label) {
      const ctx = this.ctx, pw = this.plotW();
      ctx.strokeStyle = 'rgba(120,150,185,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, P.top - GAP / 2 + 0.5); ctx.lineTo(this.w, P.top - GAP / 2 + 0.5); ctx.stroke();
      ctx.fillStyle = C.axis; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, 6, P.top + 2);
      return pw;
    }
    _paneRsi(P, i0, i1) {
      const ctx = this.ctx, r = this.calc.rsi, pw = this._paneFrame(P, 'RSI 14');
      const y = (v) => P.top + (100 - v) / 100 * P.h;
      ctx.fillStyle = 'rgba(139,123,255,0.07)'; ctx.fillRect(0, y(70), pw, y(30) - y(70));
      [30, 70].forEach((lv) => { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(160,170,200,0.35)'; ctx.beginPath(); ctx.moveTo(0, y(lv) + 0.5); ctx.lineTo(pw, y(lv) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.axis; ctx.textBaseline = 'middle'; ctx.fillText(String(lv), pw + 6, y(lv)); });
      ctx.save(); ctx.beginPath(); ctx.rect(0, P.top, pw, P.h); ctx.clip(); this._line(r, i0, i1, y, '#b4a9ff', 1.4); ctx.restore();
      const lastV = r[Math.min(i1, r.length - 1)];
      if (lastV == null) { ctx.fillStyle = C.axis; ctx.textAlign = 'center'; ctx.fillText(t('chart.notEnough'), pw / 2, P.top + P.h / 2); ctx.textAlign = 'left'; }
      this._pane = this._pane || {}; this._pane.rsi = { P, y };
    }
    _paneMacd(P, i0, i1) {
      const ctx = this.ctx, m = this.calc.macd, pw = this._paneFrame(P, 'MACD 12 26 9');
      let mx = 0; for (let i = i0; i <= i1; i++) { [m.line[i], m.signal[i], m.hist[i]].forEach((v) => { if (v != null) mx = Math.max(mx, Math.abs(v)); }); }
      mx = mx || 1; const y = (v) => P.top + P.h / 2 - v / mx * (P.h / 2 - 4);
      const cw = pw / this.view.span;
      ctx.save(); ctx.beginPath(); ctx.rect(0, P.top, pw, P.h); ctx.clip();
      for (let i = i0; i <= i1; i++) { const v = m.hist[i]; if (v == null) continue; ctx.fillStyle = v >= 0 ? 'rgba(24,210,124,0.55)' : 'rgba(255,92,108,0.55)'; const y0 = y(0), y1 = y(v); ctx.fillRect(this._x(i) - cw * 0.3, Math.min(y0, y1), Math.max(1, cw * 0.6), Math.abs(y1 - y0)); }
      this._line(m.line, i0, i1, y, '#19c2ff', 1.3); this._line(m.signal, i0, i1, y, '#f5c04a', 1.3);
      ctx.restore();
      if (m.line[i1] == null) { ctx.fillStyle = C.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('chart.notEnough'), pw / 2, P.top + P.h / 2); ctx.textAlign = 'left'; }
    }
    _drawCross(L, y) {
      const ctx = this.ctx, c = this.data[this.cross.i], xx = Math.round(this._x(this.cross.i)) + 0.5, pw = this.plotW();
      ctx.strokeStyle = C.cross; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, L.timeY); ctx.stroke();
      const cy = this.cross.y != null ? U.clamp(this.cross.y, L.main.top, L.main.top + L.main.h) : y(c.c);
      ctx.beginPath(); ctx.moveTo(0, Math.round(cy) + 0.5); ctx.lineTo(pw, Math.round(cy) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      const s = this._scale, price = s.hi - (cy - s.M.top) / s.M.h * (s.hi - s.lo);
      this._axisLabel(cy, U.fmt(price, this.decimals), '#2b4a66', '#eaf2ff');
      // time label
      const tl = this._fmtTime(c.t, false); ctx.font = '700 11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(tl).width + 12, tx = U.clamp(xx - tw / 2, 0, pw - tw);
      ctx.fillStyle = '#2b4a66'; this._rr(tx, L.timeY + 3, tw, 18, 3); ctx.fill(); ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tl, tx + 6, L.timeY + 12);
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = c.c >= c.o ? C.up : C.down; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xx, y(c.c), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      this._showTip(c, xx, cy);
    }
    _showTip(c, xx, cy) {
      const dec = this.decimals, prev = this.data[this.cross.i - 1], chg = prev ? (c.c / prev.c - 1) * 100 : (c.c / c.o - 1) * 100;
      const row = (k, v, cls) => '<dt>' + k + '</dt><dd class="' + (cls || '') + '">' + v + '</dd>';
      let extra = '';
      const i = this.cross.i;
      if (this.ind.rsi && this.calc.rsi[i] != null) extra += row('RSI', U.fmt(this.calc.rsi[i], 1));
      if (this.ind.macd && this.calc.macd.line[i] != null) extra += row('MACD', U.fmt(this.calc.macd.line[i], dec));
      this.tip.innerHTML = '<div class="d">' + U.esc(this._fmtTime(c.t, false, true)) + '</div><dl>' +
        row(t('chart.open'), U.fmt(c.o, dec)) + row(t('chart.high'), U.fmt(c.h, dec), 'up') + row(t('chart.low'), U.fmt(c.l, dec), 'down') + row(t('chart.close'), U.fmt(c.c, dec)) +
        row(t('chart.change'), U.pct(chg), U.cls(chg)) + row(t('chart.volume'), U.compact(c.v)) + extra + '</dl>';
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight, pw = this.plotW();
      let left = xx + 14; if (left + tw > pw) left = xx - tw - 14; if (left < 4) left = 4;
      let top = cy - th / 2; top = U.clamp(top, 4, this.h - th - TIME_H);
      this.tip.style.left = left + 'px'; this.tip.style.top = top + 'px';
      this.live.textContent = this._fmtTime(c.t, false, true) + ': O ' + U.fmt(c.o, dec) + ', H ' + U.fmt(c.h, dec) + ', L ' + U.fmt(c.l, dec) + ', C ' + U.fmt(c.c, dec);
    }
    _hideTip() { this.tip.hidden = true; }
    _legendUpdate(i) {
      const parts = [], dec = this.decimals, v = (a) => (a && a[i] != null ? U.fmt(a[i], dec) : '—');
      if (this.ind.sma) { parts.push('<span><i style="background:' + C.sma20 + '"></i>SMA20 ' + v(this.calc.sma20) + '</span>'); parts.push('<span><i style="background:' + C.sma50 + '"></i>SMA50 ' + v(this.calc.sma50) + '</span>'); }
      if (this.ind.ema) parts.push('<span><i style="background:' + C.ema + '"></i>EMA21 ' + v(this.calc.ema21) + '</span>');
      if (this.ind.bb) parts.push('<span><i style="background:' + C.bb + '"></i>BB 20,2 ' + v(this.calc.bb.up) + ' / ' + v(this.calc.bb.lo) + '</span>');
      this.legend.innerHTML = parts.join('');
    }
    _fmtTime(ts, short, full) {
      const intraday = ['5m', '15m', '1h', '4h'].indexOf(this.tf) >= 0, dt = new Date(ts), loc = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[NX.i18n.lang];
      if (full) return new Intl.DateTimeFormat(loc, intraday ? { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(dt);
      if (intraday) {
        if (short && dt.getHours() === 0 && dt.getMinutes() === 0) return new Intl.DateTimeFormat(loc, { day: '2-digit', month: 'short' }).format(dt);
        return new Intl.DateTimeFormat(loc, short ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(dt);
      }
      return new Intl.DateTimeFormat(loc, this.tf === '1w' ? { day: '2-digit', month: 'short', year: '2-digit' } : { day: '2-digit', month: 'short' }).format(dt);
    }

    /* ---------- interaction ---------- */
    _bind() {
      const el = this.el, h = {};
      const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      h.down = (e) => {
        if (e.button != null && e.button > 0) return;
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* synthetic or already released pointer */ }
        const p = local(e); this.pointers.set(e.pointerId, p);
        if (this.pointers.size === 2) {
          clearTimeout(this._lp); const [a, b] = Array.from(this.pointers.values());
          this.gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, span0: this.view.span, end0: this.view.end, mid: this._idxAt((a.x + b.x) / 2) };
          this.cross = null; this.draw(); return;
        }
        this.gesture = { type: 'pending', x0: p.x, y0: p.y, end0: this.view.end, touch: e.pointerType !== 'mouse', t0: Date.now() };
        if (e.pointerType === 'mouse') { this.gesture.type = 'pan'; el.classList.add('grabbing'); }
        else this._lp = setTimeout(() => { if (this.gesture && this.gesture.type === 'pending') { this.gesture.type = 'cross'; this._setCross(p.x, p.y); } }, 380);
      };
      h.move = (e) => {
        const p = local(e);
        if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
        const g = this.gesture;
        if (!g) { if (e.pointerType === 'mouse') this._setCross(p.x, p.y); return; }
        if (g.type === 'pinch' && this.pointers.size >= 2) {
          const [a, b] = Array.from(this.pointers.values()); const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          const ns = U.clamp(g.span0 * g.d0 / d, 12, Math.max(12, this.data.length + 10));
          this.view.span = ns; this.view.end = g.mid + (g.end0 - g.mid) * (ns / g.span0); this._clampView(); this.draw(); this._emitView();
          e.preventDefault(); return;
        }
        if (g.type === 'pending') {
          const dx = p.x - g.x0, dy = p.y - g.y0;
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { clearTimeout(this._lp); g.type = 'pan'; }
          else if (Math.abs(dy) > 10) { clearTimeout(this._lp); this.gesture = null; return; } // vertical swipe → page scroll
        }
        if (g.type === 'pan') {
          const cw = this.plotW() / this.view.span; this.view.end = g.end0 - (p.x - g.x0) / cw; this._clampView();
          if (e.pointerType === 'mouse') this._setCross(p.x, p.y, true); else this.cross = null;
          this.draw(); this._emitView(); e.preventDefault();
        } else if (g.type === 'cross') { this._setCross(p.x, p.y); e.preventDefault(); }
      };
      h.up = (e) => {
        clearTimeout(this._lp);
        const g = this.gesture; this.pointers.delete(e.pointerId);
        el.classList.remove('grabbing');
        if (g && g.type === 'pending' && g.touch && Date.now() - g.t0 < 380) { const p = local(e); this._setCross(p.x, p.y); } // tap → crosshair
        if (this.pointers.size === 0) this.gesture = null;
        else if (g && g.type === 'pinch') { const p = Array.from(this.pointers.values())[0]; this.gesture = { type: 'pan', x0: p.x, y0: p.y, end0: this.view.end }; }
      };
      h.leave = (e) => { if (e.pointerType === 'mouse' && !this.gesture) { this.cross = null; this.draw(); } };
      h.wheel = (e) => {
        if (!this.data.length) return; e.preventDefault();
        const p = local(e);
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) this.pan((e.deltaX || e.deltaY) / (this.plotW() / this.view.span) * 0.6);
        else this.zoom(Math.pow(1.0015, e.deltaY), this._idxAt(p.x));
      };
      h.dbl = () => { this.resetView(); this.draw(); this._emitView(); };
      h.key = (e) => {
        const n = this.data.length; if (!n) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault(); const dir = e.key === 'ArrowLeft' ? -1 : 1;
          if (e.shiftKey) { this.pan(dir * this.view.span * 0.15); return; }
          const i = U.clamp((this.cross ? this.cross.i : n - 1) + dir, 0, n - 1);
          const r = this.visibleRange(); if (i < r.i0 || i > r.i1) this.pan(i < r.i0 ? i - r.i0 : i - r.i1);
          this.cross = { i, y: null }; this.draw();
        } else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(0.8); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom(1.25); }
        else if (e.key === 'Home' || e.key === 'Escape') { e.preventDefault(); this.cross = null; this.resetView(); this.draw(); this._emitView(); }
      };
      el.addEventListener('pointerdown', h.down);
      el.addEventListener('pointermove', h.move);
      el.addEventListener('pointerup', h.up);
      el.addEventListener('pointercancel', h.up);
      el.addEventListener('pointerleave', h.leave);
      el.addEventListener('wheel', h.wheel, { passive: false });
      el.addEventListener('dblclick', h.dbl);
      el.addEventListener('keydown', h.key);
      this._h = h;
    }
    _unbind() {
      const el = this.el, h = this._h; if (!h) return;
      el.removeEventListener('pointerdown', h.down); el.removeEventListener('pointermove', h.move); el.removeEventListener('pointerup', h.up);
      el.removeEventListener('pointercancel', h.up); el.removeEventListener('pointerleave', h.leave); el.removeEventListener('wheel', h.wheel);
      el.removeEventListener('dblclick', h.dbl); el.removeEventListener('keydown', h.key);
    }
    _setCross(x, y, silent) {
      if (!this.data.length || x > this.plotW()) { if (this.cross) { this.cross = null; this.draw(); } return; }
      const i = U.clamp(this._idxAt(x), 0, this.data.length - 1);
      this.cross = { i, y };
      if (!silent) this.draw();
    }
  }

  NX.Chart = Chart;
})(window.NX);
