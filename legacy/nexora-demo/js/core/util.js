/* NEXORA core utilities. Classic script (no modules) so the app also works from a single standalone HTML file. */
window.NX = window.NX || {};
(function (NX) {
  'use strict';

  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.round = (v, d) => { const m = Math.pow(10, d || 0); return Math.round(v * m) / m; };
  U.floorTo = (v, step) => { const d = U.stepDecimals(step); return U.round(Math.floor(v / step + 1e-9) * step, d); };
  U.stepDecimals = (step) => { const s = String(step); if (s.indexOf('e-') > 0) return Number(s.split('e-')[1]); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  U.sum = (arr, fn) => arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
  U.uid = (prefix) => (prefix || 'ID') + '-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 6).toUpperCase();
  U.debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments, s = this; t = setTimeout(() => fn.apply(s, a), ms); }; };
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.deepClone = (o) => JSON.parse(JSON.stringify(o));
  U.initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

  /* ---------- Deterministic hashing / random numbers ---------- */
  U.hashStr = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  // Stateless integer mixer: same inputs always produce the same 32-bit output.
  U.mix = (a, b, c) => {
    let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  };
  U.uniform = (a, b, c) => (U.mix(a, b, c) + 0.5) / 4294967296;
  U.normal = (a, b, c) => {
    const u1 = U.uniform(a, b, c * 2 + 1), u2 = U.uniform(a ^ 0x5bd1e995, b, c * 2 + 2);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  // Seeded sequential PRNG for building seed data.
  U.rng = (seed) => {
    let s = seed >>> 0;
    const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    next.int = (a, b) => a + Math.floor(next() * (b - a + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    return next;
  };

  /* ---------- Formatting (locale-aware) ---------- */
  const locale = () => ({ ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[(NX.i18n && NX.i18n.lang) || 'en'] || 'en-US');
  const nfCache = {};
  const nf = (min, max) => {
    const k = locale() + min + '-' + max;
    return nfCache[k] || (nfCache[k] = new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max }));
  };
  U.fmt = (v, d) => {
    if (v == null || !isFinite(v)) return '—';
    const dd = d == null ? 2 : d;
    return nf(dd, dd).format(v);
  };
  U.fmtMax = (v, max) => (v == null || !isFinite(v)) ? '—' : nf(0, max == null ? 8 : max).format(v);
  // Non-zero values never render as a misleading 0.00: they become "<$0.01" / "<0.01%" with their sign.
  const tiny = (v, d) => v !== 0 && Math.abs(v) < 0.5 * Math.pow(10, -d);
  U.usd = (v, d) => { if (v == null || !isFinite(v)) return '—'; const dd = d == null ? 2 : d; return (v < 0 ? '−' : '') + (tiny(v, dd) ? '<$' + U.fmt(Math.pow(10, -dd), dd) : '$' + U.fmt(Math.abs(v), dd)); };
  U.signedUsd = (v) => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + (tiny(v, 2) ? '<$0' + U.fmt(0.01, 2).slice(1) : '$' + U.fmt(Math.abs(v), 2));
  U.pct = (v, d) => { if (v == null || !isFinite(v)) return '—'; const dd = d == null ? 2 : d; return (v > 0 ? '+' : v < 0 ? '−' : '') + (tiny(v, dd) ? '<' + U.fmt(Math.pow(10, -dd), dd) : U.fmt(Math.abs(v), dd)) + '%'; };
  U.cls = (v) => v > 0 ? 'up' : v < 0 ? 'down' : '';
  U.compact = (v) => {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e12) return U.fmt(v / 1e12, 2) + 'T';
    if (a >= 1e9) return U.fmt(v / 1e9, 2) + 'B';
    if (a >= 1e6) return U.fmt(v / 1e6, 2) + 'M';
    if (a >= 1e4) return U.fmt(v / 1e3, 1) + 'K';
    return U.fmt(v, a < 10 ? 2 : 0);
  };
  U.date = (t, opts) => t ? new Intl.DateTimeFormat(locale(), opts || { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(t)) : '—';
  U.dateTime = (t) => t ? new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : '—';
  U.time = (t) => t ? new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(t)) : '—';
  U.ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000), T = NX.i18n.t;
    if (s < 0) return T('time.in', { v: U.durationShort(-s) });
    if (s < 60) return T('time.justNow');
    return T('time.ago', { v: U.durationShort(s) });
  };
  U.durationShort = (s) => {
    const T = NX.i18n.t;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' ' + T('time.min');
    if (s < 86400) return Math.round(s / 3600) + ' ' + T('time.h');
    return Math.round(s / 86400) + ' ' + T('time.d');
  };
  U.toLocalInput = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  U.maskEmail = (e) => { const [a, b] = String(e || '').split('@'); if (!b) return e; return a.slice(0, 2) + '•••@' + b; };
  U.maskAddr = (a) => { a = String(a || ''); return a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-6) : a; };

  U.isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

  /* SVG line icons (stroke-based, inherit currentColor) */
  const P = {
    terminal: '<path d="M3 17l4-5 4 3 5-7 5 4"/><path d="M3 21h18"/>',
    crypto: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4m0 0h4.5a2 2 0 0 1 0 4H9.5M9.5 8v8M11 6.5V8m0 8v1.5"/>',
    stocks: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V8"/>',
    indices: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
    forex: '<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>',
    commodities: '<path d="M12 3 4 8l8 5 8-5-8-5Z"/><path d="m4 16 8 5 8-5"/><path d="m4 12 8 5 8-5"/>',
    heatmap: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    analysis: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    portfolio: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M16 12h.01"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    support: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a3.5 3.5 0 0 1 0 6.74"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    funnel: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    ticket: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2m0 4v2m0 4v2"/>',
    shield: '<path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3m-3 3 3 3m-6 0 2 2"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    star: '<path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    swap: '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    empty: '<path d="M3 7h18v13H3z"/><path d="M3 7l3-4h12l3 4"/><path d="M9 12h6"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    candle: '<path d="M7 3v4M7 17v4M17 3v6M17 15v6"/><rect x="5" y="7" width="4" height="10" rx="1"/><rect x="15" y="9" width="4" height="6" rx="1"/>',
    line: '<path d="M3 17l5-6 4 3 4-6 5 4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'
  };
  U.icon = (name, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.info) + '</svg>';

  // Resolves an asset path; in the standalone build assets are embedded as data URIs.
  U.assetUrl = (path) => (window.NX_ASSETS && window.NX_ASSETS[path]) || path;

  NX.util = U;
})(window.NX);
