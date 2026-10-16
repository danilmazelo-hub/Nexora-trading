/* NEXORA app state: event bus + UI/session state with safe persistence.
   Domain data (clients, accounts, orders...) lives in NX.db and is reached only through NX.api. */
(function (NX) {
  'use strict';

  /* ---------- Event bus ---------- */
  const handlers = {};
  NX.bus = {
    on(topic, fn) { (handlers[topic] = handlers[topic] || []).push(fn); return () => NX.bus.off(topic, fn); },
    off(topic, fn) { const l = handlers[topic]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(topic, payload) { (handlers[topic] || []).slice().forEach((fn) => { try { fn(payload); } catch (e) { console.error('[bus]', topic, e); } }); }
  };

  /* ---------- Safe storage (works when localStorage is blocked) ---------- */
  const mem = {};
  NX.storage = {
    available: (() => { try { const k = '__nx_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })(),
    get(key) { try { const v = localStorage.getItem(key); return v == null ? (mem[key] || null) : JSON.parse(v); } catch (e) { return mem[key] || null; } },
    set(key, val) { mem[key] = val; try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    remove(key) { delete mem[key]; try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /* ---------- UI / session state ----------
     Only non-sensitive preferences are persisted. Passwords and documents are never stored. */
  const UI_KEY = 'nexora.ui.v1';
  const defaults = {
    lang: null,
    session: null,              // { role: 'client'|'manager'|'admin', clientId?, staffId? }
    favorites: ['BTC/USD', 'ETH/USD', 'AAPL', 'EUR/USD', 'XAU/USD'],
    terminal: { symbol: 'BTC/USD', market: 'crypto', tf: '1h', chartType: 'candles', indicators: { sma: true, ema: false, bb: false, rsi: false, macd: false } },
    heatmap: { market: 'all', period: '1d', sort: 'change_desc', sub: 'all' },
    crm: { pageSize: 10 },
    notifSettings: { trades: true, payments: true, support: true, marketing: false }
  };
  const saved = NX.storage.get(UI_KEY) || {};
  delete saved.session;
  const state = Object.assign(NX.util.deepClone(defaults), saved);
  // The demo session is per browser tab (sessionStorage): one tab can be the client cabinet
  // while another tab is the CRM, both working on the same shared demo data.
  const SESSION_KEY = 'nexora.session.v1';
  const sess = {
    get() { try { const v = sessionStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(v) { try { if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* memory only */ } }
  };
  state.session = sess.get();
  state.terminal = Object.assign({}, defaults.terminal, saved.terminal || {});
  state.terminal.indicators = Object.assign({}, defaults.terminal.indicators, (saved.terminal || {}).indicators || {});
  state.heatmap = Object.assign({}, defaults.heatmap, saved.heatmap || {});

  const persist = NX.util.debounce(() => { const copy = Object.assign({}, state); delete copy.session; NX.storage.set(UI_KEY, copy); }, 150);

  NX.store = {
    state,
    get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state); },
    set(path, value) {
      const keys = path.split('.'); let o = state;
      for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = o[keys[i]] || {}; o = o[keys[i]]; }
      o[keys[keys.length - 1]] = value;
      if (keys[0] === 'session') sess.set(state.session); else persist();
      NX.bus.emit('state:' + keys[0], state[keys[0]]);
      return value;
    },
    toggleFavorite(sym) {
      const f = state.favorites.slice(); const i = f.indexOf(sym);
      if (i >= 0) f.splice(i, 1); else f.push(sym);
      NX.store.set('favorites', f);
      return i < 0;
    },
    isFavorite(sym) { return state.favorites.indexOf(sym) >= 0; },
    resetUi() { NX.storage.remove(UI_KEY); }
  };
})(window.NX);
