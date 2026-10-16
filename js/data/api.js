/* NEXORA data-access layer. UI components talk ONLY to NX.api.
   Today the transport is the in-browser demo server (NX.server) with simulated latency/errors.
   To connect a real backend, replace `transport()` with fetch()/WebSocket calls that follow
   docs/API_CONTRACTS.md — method names and payload shapes stay the same. */
(function (NX) {
  'use strict';
  const U = NX.util;

  class ApiError extends Error {
    constructor(code, vars) { super(code); this.code = code; this.vars = vars || {}; }
  }

  // Simulated network round-trip. Results are deep-cloned, as they would be after JSON transport.
  function transport(method, args, opts) {
    const cfg = NX.server.transport();
    const delay = opts && opts.instant ? 0 : Math.max(0, cfg.latencyMs * (0.6 + Math.random() * 0.8));
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          if (!(opts && opts.noFail) && cfg.failRate > 0 && Math.random() < cfg.failRate) throw new ApiError('err.network');
          const r = NX.server[method].apply(null, args || []);
          resolve(r === undefined ? null : U.deepClone(r));
        } catch (e) {
          reject(e instanceof ApiError ? e : new ApiError(e.code || 'err.unknown', e.vars));
          if (!e.code) console.error(e);
        }
      }, delay);
    });
  }
  const call = (m, opts) => (...args) => transport(m, args, opts);

  const api = {
    ApiError,
    // auth (demo scenarios only — no password is sent or stored anywhere)
    auth: {
      login: (email) => transport('login', [email]),
      register: (data) => transport('register', [{ name: data.name, email: data.email, country: data.country }]),
      recover: call('recover'),
      staffSession: call('staffFor')
    },
    // market data — deterministic simulator; a real implementation would use REST + WebSocket
    market: {
      instruments: call('instruments', { noFail: true }),
      fees: call('fees'),
      quote: (id) => NX.market.quote(id, null, true),
      quotes: (ids) => ids.map((id) => NX.market.quote(id)),
      // Live instruments: real candles from the provider (via NX.live); others: simulator.
      candles: async (id, tf, limit) => {
        if (NX.live && NX.live.source(id)) await NX.live.fetchCandles(id, tf, limit || 300);
        await new Promise((r) => setTimeout(r, 10));
        return NX.market.candles(id, tf, limit || 300);
      },
      candlesSync: (id, tf, limit) => NX.market.candles(id, tf, limit || 300),
      changeOver: (id, period) => NX.market.changeOver(id, period),
      now: () => NX.market.now(),
      // Push channel: callback on every simulated tick (would be a WebSocket subscription).
      subscribe: (fn) => NX.bus.on('market:tick', fn)
    },
    me: { get: call('me'), update: call('updateMe'), submitKyc: call('submitKyc') },
    trading: {
      account: call('account'),
      accountSync: (id) => NX.server.account(id),
      orders: call('orders'),
      trades: call('trades'),
      // Client-side preview for instant feedback; the server re-validates on placeOrder.
      preview: (accountId, req) => NX.server.previewOrder(accountId, req),
      placeOrder: call('placeOrder'),
      cancelOrder: call('cancelOrder')
    },
    payments: {
      list: call('payments'),
      createDeposit: call('createDeposit'),
      simulateArrival: call('simulateDepositArrival'),
      createWithdrawal: call('createWithdrawal'),
      cancel: call('cancelPayment'),
      review: call('reviewWithdrawal'),
      pending: call('pendingWithdrawals')
    },
    notifications: { list: call('notifications', { noFail: true }), markRead: call('markNotifications') },
    support: { list: call('tickets'), create: call('createTicket'), reply: call('replyTicket'), update: call('updateTicket') },
    crm: {
      dashboard: call('dashboard'), clients: call('clients'), clientsBrief: call('allClientsBrief'), client: call('client'),
      createClient: call('createClient'), updateClient: call('updateClient'),
      addNote: call('addNote'), deleteNote: call('deleteNote'), togglePin: call('toggleNotePin'),
      logInteraction: call('logInteraction'),
      tasks: call('tasks'), createTask: call('createTask'), updateTask: call('updateTask')
    },
    admin: {
      staff: call('staff'), saveStaff: call('saveStaff'), roles: call('roles'), setPermission: call('setRolePermission'),
      setInstrument: call('setInstrument'), setMarket: call('setMarketEnabled'), setFees: call('setFees'),
      settings: call('settings', { noFail: true }), saveSettings: call('saveSettings'),
      setClock: call('setClock', { noFail: true, instant: true }), resetDemo: call('resetDemo', { noFail: true })
    },
    // Simulated permission check for UI only. Real access control MUST be enforced by the server.
    can: (perm) => NX.server.can(perm)
  };

  NX.api = api;
})(window.NX);
