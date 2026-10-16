/* NEXORA demo backend emulator.
   Owns the demo database, persists it to localStorage, enforces business rules and
   (simulated) permissions. NX.api is the only caller. Replace NX.api's transport with
   HTTP/WebSocket calls to a real backend and this file is no longer needed. */
(function (NX) {
  'use strict';
  const U = NX.util, L = NX.ledger;
  const KEY = 'nexora.db.v1', LEADER_KEY = 'nexora.leader';
  const TAB = U.uid('TAB');
  let db = null;

  const err = (code, vars) => { const e = new Error(code); e.code = code; e.vars = vars || {}; return e; };

  function configureMarket() { NX.market.configure({ seed: db.settings.seed, clock: db.settings.clock, spreads: spreadMap() }); }
  function spreadMap() { const m = {}; Object.keys(db.settings.instruments || {}).forEach((id) => { const o = db.settings.instruments[id]; if (o.spreadBps != null) m[id] = o.spreadBps; }); return m; }

  function load() {
    const saved = NX.storage.get(KEY);
    if (saved && saved.version === NX.seed.DB_VERSION) { db = saved; configureMarket(); return false; }
    db = NX.seed.build({});
    persist();
    return true;
  }
  function persist() { db.updatedAt = Date.now(); NX.storage.set(KEY, db); }
  // Every mutation goes through commit(): persist + notify views.
  function commit(cols) { persist(); NX.bus.emit('db:change', { cols, remote: false }); }

  // Another tab changed the demo data → reload and refresh views.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { db = JSON.parse(e.newValue); configureMarket(); NX.bus.emit('db:change', { cols: ['*'], remote: true }); } catch (x) { /* ignore */ }
  });

  // Only one open tab processes limit-order matching and payment progress (avoids double fills).
  function isLeader() {
    const now = Date.now(), cur = NX.storage.get(LEADER_KEY);
    if (!cur || cur.tab === TAB || now - cur.ts > 6000) { NX.storage.set(LEADER_KEY, { tab: TAB, ts: now }); return true; }
    return false;
  }

  /* ---------- Session & permissions (simulated) ---------- */
  const session = () => NX.store.state.session || null;
  function perms() {
    const s = session(); if (!s) return [];
    const role = db.roles.find((r) => r.id === s.role);
    return role ? role.permissions : [];
  }
  const can = (p) => perms().indexOf(p) >= 0;
  function need(p) { if (!can(p)) throw err('err.forbidden'); }
  function selfClientId() { const s = session(); if (!s || s.role !== 'client') throw err('err.forbidden'); return s.clientId; }
  // Client may only touch its own records; staff with crm.view may read any.
  function canSeeClient(clientId) { const s = session(); if (!s) return false; return s.role === 'client' ? s.clientId === clientId : can('crm.view'); }
  function accountOf(accountId) {
    const a = db.accounts.find((x) => x.id === accountId); if (!a) throw err('err.noAccount');
    if (!canSeeClient(a.clientId)) throw err('err.forbidden');
    return a;
  }
  const staffId = () => (session() || {}).staffId || null;
  const now = () => NX.market.now();

  /* ---------- Matching & payment progress (runs on market ticks) ---------- */
  function processTick() {
    if (!db || !isLeader()) return;
    const t = now(); const changed = new Set();
    db.orders.filter((o) => o.status === 'open' && o.type === 'limit').forEach((o) => {
      const q = NX.market.quote(o.instrumentId, t);
      const hit = o.side === 'buy' ? q.ask <= o.limitPrice : q.bid >= o.limitPrice;
      if (!hit) return;
      const inst = NX.catalog.get(o.instrumentId);
      if (!L.instrumentEnabled(db, inst)) return;
      const pos = L.position(db, o.accountId, o.instrumentId);
      if (o.side === 'sell' && (!pos || pos.qty + 1e-9 < o.qty)) { o.status = 'rejected'; o.reason = 'err.qtyExceeds'; o.updatedAt = t; changed.add('orders'); return; }
      o.reservedUsd = 0; // release reservation, then fill at the limit price
      const tr = L.applyFill(db, o, o.side === 'buy' ? Math.min(o.limitPrice, q.ask) : Math.max(o.limitPrice, q.bid), t);
      L.notify(db, o.clientId, 'trade', 'notif.limitFilled', { side: o.side, qty: U.fmtMax(o.qty, 8), symbol: inst.symbol, price: U.fmt(tr.price, inst.decimals) }, t);
      L.systemEvent(db, o.clientId, 'ev.trade', { side: o.side, qty: U.fmtMax(o.qty, 8), symbol: inst.symbol }, t);
      ['orders', 'trades', 'positions', 'accounts', 'notifications', 'interactions'].forEach((c) => changed.add(c));
    });
    db.payments.forEach((p) => {
      // An unpaid deposit request expires after 30 minutes: clear final state, nothing credited.
      if (p.type === 'deposit' && p.status === 'awaiting' && t - p.createdAt >= 30 * 60000) {
        p.status = 'expired'; p.history.push({ status: 'expired', at: t });
        L.notify(db, p.clientId, 'payment', 'notif.depositExpired', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
        ['payments', 'notifications'].forEach((c) => changed.add(c));
      }
      if (p.type === 'deposit' && p.status === 'confirming' && t - p.confirmStartedAt >= 12000) {
        p.status = 'completed'; p.completedAt = t; p.history.push({ status: 'completed', at: t });
        const acc = db.accounts.find((a) => a.id === p.accountId); acc.cash += p.amountUsd; acc.updatedAt = t;
        const c = db.clients.find((x) => x.id === p.clientId); if (c && (c.stage === 'registered' || c.stage === 'qualified')) { c.stage = 'funded'; L.systemEvent(db, c.id, 'ev.stage', { stage: 'funded' }, t); }
        L.notify(db, p.clientId, 'payment', 'notif.depositDone', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
        L.systemEvent(db, p.clientId, 'ev.deposit', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
        ['payments', 'accounts', 'notifications', 'interactions', 'clients'].forEach((c) => changed.add(c));
      }
      if (p.type === 'withdrawal' && p.status === 'processing' && t - p.processingAt >= 10000) {
        p.status = 'completed'; p.completedAt = t; p.history.push({ status: 'completed', at: t });
        L.notify(db, p.clientId, 'payment', 'notif.withdrawDone', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
        L.systemEvent(db, p.clientId, 'ev.withdrawal', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
        ['payments', 'notifications', 'interactions'].forEach((c) => changed.add(c));
      }
    });
    db.tasks.forEach((tk) => {
      if (tk.status === 'open' && !tk.reminded && tk.remindAt && tk.remindAt <= t) { tk.reminded = true; changed.add('tasks'); }
    });
    if (changed.size) commit(Array.from(changed));
  }
  NX.bus.on('market:tick', processTick);

  /* ---------- Shared helpers ---------- */
  const clientView = (c) => {
    const acc = c.accountId ? db.accounts.find((a) => a.id === c.accountId) : null;
    const sum = acc ? L.accountSummary(db, acc.id, now()) : null;
    const mgr = db.staff.find((s) => s.id === c.managerId);
    return Object.assign({}, c, { managerName: mgr ? mgr.name : null, equity: sum ? sum.equity : 0, cash: sum ? sum.cash : 0, positionsCount: sum ? sum.positions.length : 0,
      deposits: U.sum(db.payments.filter((p) => p.clientId === c.id && p.type === 'deposit' && p.status === 'completed'), (p) => p.amountUsd),
      openTickets: db.tickets.filter((x) => x.clientId === c.id && (x.status === 'open' || x.status === 'in_progress')).length });
  };
  // Client-facing projection: never includes CRM-internal data (notes, tasks, interactions, source, tags).
  const clientSelf = (c) => {
    const mgr = db.staff.find((s) => s.id === c.managerId);
    return { id: c.id, name: c.name, email: c.email, phone: c.phone, country: c.country, language: c.language, kyc: c.kyc, accountId: c.accountId, createdAt: c.createdAt,
      manager: mgr ? { name: mgr.name, email: mgr.email, phone: mgr.phone } : null };
  };
  function sortBy(list, key, dir) {
    const m = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => { const x = a[key], y = b[key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * m; });
  }

  /* ---------- Public server API (synchronous; NX.api wraps it asynchronously) ---------- */
  const S = {
    load, can, perms, now,
    snapshotForDebug: () => db,

    /* auth */
    login(email) {
      const c = db.clients.find((x) => x.email.toLowerCase() === String(email || '').trim().toLowerCase() && x.accountId);
      const target = c || db.clients[0];
      return { role: 'client', clientId: target.id, matched: !!c };
    },
    register(data) {
      if (!U.isEmail(data.email)) throw err('err.email');
      if (db.clients.some((x) => x.email.toLowerCase() === data.email.toLowerCase())) throw err('err.emailTaken');
      const t = now();
      const c = { id: L.nextId(db, 'CL'), name: data.name.trim(), email: data.email.trim(), phone: '', country: data.country || 'UA', language: NX.i18n.lang, stage: 'registered', managerId: null, source: 'website', tags: [], kyc: 'none', accountId: null, createdAt: t, updatedAt: t, lastActivityAt: t };
      db.clients.push(c);
      const acc = { id: L.nextId(db, 'AC'), clientId: c.id, currency: 'USD', type: 'demo', cash: 0, status: 'active', createdAt: t, updatedAt: t };
      db.accounts.push(acc); c.accountId = acc.id;
      const credit = db.settings.startBalance || 0;
      if (credit > 0) {
        acc.cash = credit;
        db.payments.push({ id: L.nextId(db, 'PM'), clientId: c.id, accountId: acc.id, type: 'demo_credit', asset: 'USD', network: '—', amount: credit, amountUsd: credit, fee: 0, status: 'completed', ref: 'DEMO-CREDIT', createdAt: t, completedAt: t, history: [{ status: 'completed', at: t }] });
      }
      L.systemEvent(db, c.id, 'ev.registered', { source: 'website' }, t);
      L.notify(db, c.id, 'account', 'notif.welcome', {}, t);
      commit(['clients', 'accounts', 'payments', 'interactions', 'notifications']);
      return { role: 'client', clientId: c.id };
    },
    recover(email) { if (!U.isEmail(email)) throw err('err.email'); return { sent: true }; },
    staffFor(role) { const s = db.staff.find((x) => x.role === role && x.active); return { role, staffId: s ? s.id : null }; },

    /* market */
    instruments() {
      return NX.catalog.all().map((i) => Object.assign({}, i, { enabled: L.instrumentEnabled(db, i), spreadBps: NX.market.spreadBps(i.id), feeRate: ((db.settings.instruments[i.id] || {}).feeRate) }));
    },
    fees() { return U.deepClone({ fees: db.settings.fees, withdrawFees: db.settings.withdrawFees, minOrderUsd: db.settings.minOrderUsd, minDepositUsd: db.settings.minDepositUsd, maxDepositUsd: db.settings.maxDepositUsd || 100000, minWithdrawUsd: db.settings.minWithdrawUsd }); },

    /* client cabinet */
    me() { const id = selfClientId(); return clientSelf(db.clients.find((c) => c.id === id)); },
    updateMe(patch) {
      const c = db.clients.find((x) => x.id === selfClientId());
      if (patch.name != null) { if (String(patch.name).trim().length < 2) throw err('err.name'); c.name = String(patch.name).trim(); }
      if (patch.phone != null) c.phone = String(patch.phone).trim().slice(0, 32);
      if (patch.country != null) c.country = String(patch.country).slice(0, 2);
      if (patch.language != null) c.language = patch.language;
      c.updatedAt = now();
      L.systemEvent(db, c.id, 'ev.profileUpdated', {}, now());
      commit(['clients', 'interactions']);
      return clientSelf(c);
    },
    submitKyc() {
      const c = db.clients.find((x) => x.id === selfClientId());
      if (c.kyc === 'verified') return clientSelf(c);
      c.kyc = 'pending'; c.updatedAt = now();
      L.systemEvent(db, c.id, 'ev.kycSubmitted', {}, now());
      commit(['clients', 'interactions']);
      return clientSelf(c);
    },
    account(accountId) { accountOf(accountId); return L.accountSummary(db, accountId, now()); },
    orders(accountId, status) { accountOf(accountId); return db.orders.filter((o) => o.accountId === accountId && (!status || (status === 'open' ? o.status === 'open' : o.status !== 'open'))).sort((a, b) => b.createdAt - a.createdAt); },
    trades(accountId) { accountOf(accountId); return db.trades.filter((x) => x.accountId === accountId).sort((a, b) => b.at - a.at); },
    previewOrder(accountId, req) { accountOf(accountId); return L.preview(db, accountId, req, now()); },
    placeOrder(accountId, req) {
      const acc = accountOf(accountId);
      if (session().role !== 'client' || !can('terminal.trade')) throw err('err.forbidden');
      const t = now();
      const pv = L.preview(db, accountId, req, t);
      if (!pv.ok) throw err(pv.errors[0]);
      const inst = NX.catalog.get(pv.instrumentId);
      const order = { id: L.nextId(db, 'OR'), accountId, clientId: acc.clientId, instrumentId: inst.id, side: pv.side, type: pv.type, qty: pv.qty, limitPrice: pv.type === 'limit' ? pv.price : null, status: 'new', createdAt: t, updatedAt: t, reservedUsd: 0 };
      db.orders.push(order);
      let trade = null;
      if (pv.type === 'limit') order.limitPrice = pv.limitPrice;
      if (pv.type === 'market' || pv.marketable) {
        trade = L.applyFill(db, order, pv.price, t);
        L.notify(db, acc.clientId, 'trade', 'notif.tradeFilled', { side: order.side, qty: U.fmtMax(order.qty, 8), symbol: inst.symbol, price: U.fmt(trade.price, inst.decimals) }, t);
        L.systemEvent(db, acc.clientId, 'ev.trade', { side: order.side, qty: U.fmtMax(order.qty, 8), symbol: inst.symbol }, t);
      } else {
        order.status = 'open';
        if (order.side === 'buy') order.reservedUsd = pv.totalUsd;
        L.notify(db, acc.clientId, 'trade', 'notif.limitPlaced', { side: order.side, qty: U.fmtMax(order.qty, 8), symbol: inst.symbol, price: U.fmt(order.limitPrice, inst.decimals) }, t);
      }
      commit(['orders', 'trades', 'positions', 'accounts', 'notifications', 'interactions', 'clients']);
      return { order: Object.assign({}, order), trade };
    },
    cancelOrder(orderId) {
      const o = db.orders.find((x) => x.id === orderId); if (!o) throw err('err.notFound');
      accountOf(o.accountId);
      if (o.status !== 'open') throw err('err.orderNotOpen');
      o.status = 'cancelled'; o.reservedUsd = 0; o.updatedAt = now();
      commit(['orders', 'accounts']);
      return Object.assign({}, o);
    },
    notifications() { const id = selfClientId(); return db.notifications.filter((n) => n.clientId === id).sort((a, b) => b.at - a.at); },
    markNotifications(ids) { const id = selfClientId(); db.notifications.forEach((n) => { if (n.clientId === id && (!ids || ids.indexOf(n.id) >= 0)) n.read = true; }); commit(['notifications']); return true; },

    /* payments (simulation only — no real transfer is ever made) */
    payments(clientId) {
      const id = clientId || selfClientId();
      if (!canSeeClient(id)) throw err('err.forbidden');
      return db.payments.filter((p) => p.clientId === id).sort((a, b) => b.createdAt - a.createdAt);
    },
    createDeposit(req) {
      const cid = selfClientId(), c = db.clients.find((x) => x.id === cid), t = now();
      const a = L.WALLET_ASSETS[req.asset]; if (!a || a.networks.indexOf(req.network) < 0) throw err('err.asset');
      const amount = Number(req.amount); if (!(amount > 0)) throw err('err.amount');
      const usd = amount * L.assetUsd(req.asset, t);
      if (usd < db.settings.minDepositUsd) throw err('err.minDeposit', { min: U.fmt(db.settings.minDepositUsd, 0) });
      if (usd > (db.settings.maxDepositUsd || 100000)) throw err('err.maxDeposit', { max: U.fmt(db.settings.maxDepositUsd || 100000, 0) });
      const p = { id: L.nextId(db, 'PM'), clientId: cid, accountId: c.accountId, type: 'deposit', asset: req.asset, network: req.network, amount, amountUsd: usd, fee: 0, status: 'awaiting', ref: 'SIM-' + U.uid('').slice(1, 9), createdAt: t, history: [{ status: 'awaiting', at: t }] };
      db.payments.push(p);
      commit(['payments']);
      return Object.assign({}, p);
    },
    simulateDepositArrival(paymentId) {
      const p = db.payments.find((x) => x.id === paymentId); if (!p || p.type !== 'deposit') throw err('err.notFound');
      if (p.clientId !== selfClientId()) throw err('err.forbidden');
      if (p.status !== 'awaiting') throw err('err.paymentState');
      p.status = 'confirming'; p.confirmStartedAt = now(); p.history.push({ status: 'confirming', at: now() });
      commit(['payments']);
      return Object.assign({}, p);
    },
    cancelPayment(paymentId) {
      const p = db.payments.find((x) => x.id === paymentId); if (!p) throw err('err.notFound');
      if (p.clientId !== selfClientId()) throw err('err.forbidden');
      const t = now();
      if (p.type === 'deposit' && p.status === 'awaiting') { p.status = 'cancelled'; }
      else if (p.type === 'withdrawal' && p.status === 'review') {
        p.status = 'cancelled'; const acc = db.accounts.find((a) => a.id === p.accountId); acc.cash += p.holdUsd; acc.updatedAt = t;
      } else throw err('err.paymentState');
      p.history.push({ status: 'cancelled', at: t });
      commit(['payments', 'accounts']);
      return Object.assign({}, p);
    },
    createWithdrawal(req) {
      const cid = selfClientId(), c = db.clients.find((x) => x.id === cid), t = now();
      if (c.kyc !== 'verified') throw err('err.kycRequired');
      const a = L.WALLET_ASSETS[req.asset]; if (!a || a.networks.indexOf(req.network) < 0) throw err('err.asset');
      const addr = String(req.address || '').trim();
      if (!L.ADDRESS_RULES[req.network].test(addr)) throw err('err.address');
      const amount = Number(req.amount); if (!(amount > 0)) throw err('err.amount');
      const px = L.assetUsd(req.asset, t);
      const fee = db.settings.withdrawFees[req.asset + ':' + req.network] || 0;
      const holdUsd = (amount + fee) * px;
      if (amount * px < db.settings.minWithdrawUsd) throw err('err.minWithdraw', { min: db.settings.minWithdrawUsd });
      const sum = L.accountSummary(db, c.accountId, t);
      if (holdUsd > sum.available + 1e-6) throw err('err.funds');
      const acc = db.accounts.find((x) => x.id === c.accountId); acc.cash -= holdUsd; acc.updatedAt = t;
      // Only a masked address is stored.
      const p = { id: L.nextId(db, 'PM'), clientId: cid, accountId: c.accountId, type: 'withdrawal', asset: req.asset, network: req.network, amount, amountUsd: amount * px, fee, holdUsd, address: U.maskAddr(addr), status: 'review', ref: 'SIM-' + U.uid('').slice(1, 9), createdAt: t, history: [{ status: 'review', at: t }] };
      db.payments.push(p);
      L.systemEvent(db, cid, 'ev.withdrawRequested', { amount: U.fmtMax(amount, 8), asset: req.asset }, t);
      commit(['payments', 'accounts', 'interactions']);
      return Object.assign({}, p);
    },
    reviewWithdrawal(paymentId, approve, reason) {
      need('payments.approve');
      const p = db.payments.find((x) => x.id === paymentId); if (!p || p.type !== 'withdrawal') throw err('err.notFound');
      if (p.status !== 'review') throw err('err.paymentState');
      const t = now();
      if (approve) { p.status = 'processing'; p.processingAt = t; p.history.push({ status: 'processing', at: t, by: staffId() }); }
      else {
        p.status = 'rejected'; p.reason = reason || ''; p.history.push({ status: 'rejected', at: t, by: staffId() });
        const acc = db.accounts.find((a) => a.id === p.accountId); acc.cash += p.holdUsd; acc.updatedAt = t;
        L.notify(db, p.clientId, 'payment', 'notif.withdrawRejected', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t);
      }
      L.systemEvent(db, p.clientId, approve ? 'ev.withdrawApproved' : 'ev.withdrawRejected', { amount: U.fmtMax(p.amount, 8), asset: p.asset }, t, staffId());
      commit(['payments', 'accounts', 'notifications', 'interactions']);
      return Object.assign({}, p);
    },
    pendingWithdrawals() { need('crm.view'); return db.payments.filter((p) => p.type === 'withdrawal' && p.status === 'review').sort((a, b) => a.createdAt - b.createdAt).map((p) => Object.assign({}, p, { clientName: (db.clients.find((c) => c.id === p.clientId) || {}).name })); },

    /* support tickets (shared by cabinet and CRM) */
    tickets(filter) {
      const s = session(); filter = filter || {};
      let list = db.tickets;
      if (s.role === 'client') list = list.filter((x) => x.clientId === s.clientId);
      else { need('crm.view'); if (filter.clientId) list = list.filter((x) => x.clientId === filter.clientId); if (filter.status && filter.status !== 'all') list = list.filter((x) => x.status === filter.status); }
      return list.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((tk) => Object.assign({}, tk, { clientName: (db.clients.find((c) => c.id === tk.clientId) || {}).name }));
    },
    createTicket(req) {
      const cid = selfClientId(), t = now(), c = db.clients.find((x) => x.id === cid);
      if (!req.subject || String(req.subject).trim().length < 3) throw err('err.subject');
      if (!req.text || String(req.text).trim().length < 3) throw err('err.message');
      const tk = { id: L.nextId(db, 'SR'), clientId: cid, subject: String(req.subject).trim().slice(0, 140), category: req.category || 'other', status: 'open', priority: 'normal', assigneeId: c.managerId || null, createdAt: t, updatedAt: t, messages: [{ id: L.nextId(db, 'MS'), author: 'client', text: String(req.text).trim().slice(0, 2000), at: t }] };
      db.tickets.push(tk);
      L.systemEvent(db, cid, 'ev.ticketCreated', { id: tk.id }, t);
      commit(['tickets', 'interactions']);
      return Object.assign({}, tk);
    },
    replyTicket(ticketId, text) {
      const tk = db.tickets.find((x) => x.id === ticketId); if (!tk) throw err('err.notFound');
      const s = session(), t = now();
      if (!text || !String(text).trim()) throw err('err.message');
      if (s.role === 'client') {
        if (tk.clientId !== s.clientId) throw err('err.forbidden');
        tk.messages.push({ id: L.nextId(db, 'MS'), author: 'client', text: String(text).trim().slice(0, 2000), at: t });
        if (tk.status === 'resolved' || tk.status === 'closed') tk.status = 'open';
      } else {
        need('crm.tickets');
        tk.messages.push({ id: L.nextId(db, 'MS'), author: 'staff', staffId: staffId(), text: String(text).trim().slice(0, 2000), at: t });
        if (tk.status === 'open') tk.status = 'in_progress';
        if (!tk.assigneeId) tk.assigneeId = staffId();
        L.notify(db, tk.clientId, 'support', 'notif.ticketReply', { id: tk.id }, t);
      }
      tk.updatedAt = t;
      commit(['tickets', 'notifications']);
      return Object.assign({}, tk);
    },
    updateTicket(ticketId, patch) {
      need('crm.tickets');
      const tk = db.tickets.find((x) => x.id === ticketId); if (!tk) throw err('err.notFound');
      if (patch.status) { tk.status = patch.status; L.systemEvent(db, tk.clientId, 'ev.ticketStatus', { id: tk.id, status: patch.status }, now(), staffId()); if (patch.status === 'resolved') L.notify(db, tk.clientId, 'support', 'notif.ticketResolved', { id: tk.id }, now()); }
      if (patch.assigneeId !== undefined) tk.assigneeId = patch.assigneeId || null;
      if (patch.priority) tk.priority = patch.priority;
      tk.updatedAt = now();
      commit(['tickets', 'interactions', 'notifications']);
      return Object.assign({}, tk);
    },

    /* CRM */
    clients(q) {
      need('crm.view'); q = q || {};
      let list = db.clients.map(clientView);
      const s = (q.search || '').trim().toLowerCase();
      if (s) list = list.filter((c) => (c.name + ' ' + c.email + ' ' + c.id + ' ' + (c.phone || '')).toLowerCase().indexOf(s) >= 0);
      if (q.stage && q.stage !== 'all') list = list.filter((c) => (q.stage === 'leads' ? ['new', 'contacted', 'qualified'].indexOf(c.stage) >= 0 : q.stage === 'clients' ? ['new', 'contacted', 'qualified'].indexOf(c.stage) < 0 : c.stage === q.stage));
      if (q.managerId && q.managerId !== 'all') list = list.filter((c) => (q.managerId === 'none' ? !c.managerId : c.managerId === q.managerId));
      if (q.kyc && q.kyc !== 'all') list = list.filter((c) => c.kyc === q.kyc);
      sortBy(list, q.sort || 'createdAt', q.dir || 'desc');
      const total = list.length, size = q.pageSize || 10, pages = Math.max(1, Math.ceil(total / size)), page = U.clamp(q.page || 1, 1, pages);
      return { items: list.slice((page - 1) * size, page * size), total, page, pages, pageSize: size };
    },
    allClientsBrief() { need('crm.view'); return db.clients.map((c) => ({ id: c.id, name: c.name, stage: c.stage, managerId: c.managerId, email: c.email, createdAt: c.createdAt, kyc: c.kyc })); },
    client(id) {
      need('crm.view');
      const c = db.clients.find((x) => x.id === id); if (!c) throw err('err.notFound');
      const v = clientView(c);
      v.account = c.accountId ? L.accountSummary(db, c.accountId, now()) : null;
      v.orders = c.accountId ? db.orders.filter((o) => o.accountId === c.accountId).sort((a, b) => b.createdAt - a.createdAt) : [];
      v.trades = c.accountId ? db.trades.filter((x) => x.accountId === c.accountId).sort((a, b) => b.at - a.at) : [];
      v.payments = db.payments.filter((p) => p.clientId === id).sort((a, b) => b.createdAt - a.createdAt);
      v.notes = can('crm.notes') ? db.notes.filter((n) => n.clientId === id).sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at)) : [];
      v.tasks = db.tasks.filter((x) => x.clientId === id).sort((a, b) => a.dueAt - b.dueAt);
      v.interactions = db.interactions.filter((x) => x.clientId === id).sort((a, b) => b.at - a.at);
      v.tickets = db.tickets.filter((x) => x.clientId === id).sort((a, b) => b.updatedAt - a.updatedAt);
      return v;
    },
    createClient(data) {
      need('crm.clients.create');
      if (!data.name || String(data.name).trim().length < 2) throw err('err.name');
      if (!U.isEmail(data.email)) throw err('err.email');
      if (db.clients.some((x) => x.email.toLowerCase() === String(data.email).trim().toLowerCase())) throw err('err.emailTaken');
      const t = now();
      const c = { id: L.nextId(db, 'CL'), name: String(data.name).trim(), email: String(data.email).trim(), phone: String(data.phone || '').trim(), country: data.country || 'UA', language: data.language || 'ru', stage: data.stage || 'new', managerId: data.managerId || null, source: data.source || 'manual', tags: [], kyc: 'none', accountId: null, createdAt: t, updatedAt: t, lastActivityAt: t };
      db.clients.push(c);
      L.systemEvent(db, c.id, 'ev.leadCreated', { source: c.source }, t, staffId());
      commit(['clients', 'interactions']);
      return clientView(c);
    },
    updateClient(id, patch) {
      need('crm.clients.edit');
      const c = db.clients.find((x) => x.id === id); if (!c) throw err('err.notFound');
      const t = now();
      if (patch.name != null) { if (String(patch.name).trim().length < 2) throw err('err.name'); c.name = String(patch.name).trim(); }
      if (patch.email != null) { if (!U.isEmail(patch.email)) throw err('err.email'); if (db.clients.some((x) => x.id !== id && x.email.toLowerCase() === patch.email.toLowerCase())) throw err('err.emailTaken'); c.email = String(patch.email).trim(); }
      ['phone', 'country', 'language', 'source'].forEach((k) => { if (patch[k] != null) c[k] = String(patch[k]).trim(); });
      if (patch.tags) c.tags = patch.tags;
      if (patch.kyc && patch.kyc !== c.kyc) { c.kyc = patch.kyc; L.systemEvent(db, id, 'ev.kycChanged', { kyc: patch.kyc }, t, staffId()); L.notify(db, id, 'account', 'notif.kycChanged', { kyc: patch.kyc }, t); }
      if (patch.stage && patch.stage !== c.stage) {
        const from = c.stage; c.stage = patch.stage;
        L.systemEvent(db, id, 'ev.stageChange', { from, to: patch.stage }, t, staffId());
        // Converting a lead creates a demo trading account so the client can log in.
        if (!c.accountId && ['registered', 'funded', 'active'].indexOf(patch.stage) >= 0) {
          const acc = { id: L.nextId(db, 'AC'), clientId: c.id, currency: 'USD', type: 'demo', cash: 0, status: 'active', createdAt: t, updatedAt: t };
          db.accounts.push(acc); c.accountId = acc.id;
        }
      }
      if (patch.managerId !== undefined && patch.managerId !== c.managerId) {
        need('crm.assign');
        const from = c.managerId; c.managerId = patch.managerId || null;
        const mgr = db.staff.find((s) => s.id === c.managerId);
        L.systemEvent(db, id, 'ev.managerChange', { from: (db.staff.find((s) => s.id === from) || {}).name || '—', to: mgr ? mgr.name : '—' }, t, staffId());
        if (mgr) L.notify(db, id, 'account', 'notif.managerAssigned', { name: mgr.name }, t);
      }
      if (patch.accountStatus && c.accountId) { const acc = db.accounts.find((a) => a.id === c.accountId); acc.status = patch.accountStatus; L.systemEvent(db, id, 'ev.accountStatus', { status: patch.accountStatus }, t, staffId()); }
      c.updatedAt = t;
      commit(['clients', 'interactions', 'notifications', 'accounts']);
      return clientView(c);
    },
    addNote(clientId, text, pinned) {
      need('crm.notes');
      if (!text || String(text).trim().length < 2) throw err('err.note');
      const n = { id: L.nextId(db, 'NT'), clientId, staffId: staffId(), text: String(text).trim().slice(0, 4000), at: now(), pinned: !!pinned };
      db.notes.push(n); commit(['notes']); return Object.assign({}, n);
    },
    deleteNote(id) { need('crm.notes'); const i = db.notes.findIndex((n) => n.id === id); if (i >= 0) db.notes.splice(i, 1); commit(['notes']); return true; },
    toggleNotePin(id) { need('crm.notes'); const n = db.notes.find((x) => x.id === id); if (n) n.pinned = !n.pinned; commit(['notes']); return true; },
    logInteraction(clientId, type, text) {
      need('crm.clients.edit');
      if (!text || String(text).trim().length < 2) throw err('err.message');
      L.interaction(db, clientId, type, String(text).trim().slice(0, 2000), staffId(), now());
      const c = db.clients.find((x) => x.id === clientId); if (c && c.stage === 'new') { c.stage = 'contacted'; L.systemEvent(db, c.id, 'ev.stageChange', { from: 'new', to: 'contacted' }, now(), staffId()); }
      commit(['interactions', 'clients']); return true;
    },
    tasks(q) {
      need('crm.view'); q = q || {};
      let list = db.tasks.slice();
      if (q.clientId) list = list.filter((x) => x.clientId === q.clientId);
      if (q.assigneeId && q.assigneeId !== 'all') list = list.filter((x) => x.assigneeId === q.assigneeId);
      if (q.status && q.status !== 'all') list = list.filter((x) => (q.status === 'overdue' ? x.status === 'open' && x.dueAt < now() : x.status === q.status));
      return list.sort((a, b) => (a.status === b.status ? a.dueAt - b.dueAt : a.status === 'open' ? -1 : 1)).map((x) => Object.assign({}, x, { clientName: (db.clients.find((c) => c.id === x.clientId) || {}).name || null }));
    },
    createTask(data) {
      need('crm.tasks');
      if (!data.title || String(data.title).trim().length < 2) throw err('err.title');
      const due = Number(data.dueAt); if (!(due > 0)) throw err('err.due');
      const tk = { id: L.nextId(db, 'TK'), clientId: data.clientId || null, title: String(data.title).trim().slice(0, 200), type: data.type || 'todo', dueAt: due, remindAt: data.remindAt ? Number(data.remindAt) : null, assigneeId: data.assigneeId || staffId(), status: 'open', priority: data.priority || 'normal', createdAt: now(), createdBy: staffId(), reminded: false };
      if (tk.remindAt && tk.remindAt <= now()) tk.reminded = true;
      db.tasks.push(tk); commit(['tasks']); return Object.assign({}, tk);
    },
    updateTask(id, patch) {
      need('crm.tasks');
      const tk = db.tasks.find((x) => x.id === id); if (!tk) throw err('err.notFound');
      if (patch.status) { tk.status = patch.status; if (patch.status === 'done' && tk.clientId) L.systemEvent(db, tk.clientId, 'ev.taskDone', { title: typeof tk.title === 'string' ? tk.title : tk.title[NX.i18n.lang] }, now(), staffId()); }
      if (patch.assigneeId) tk.assigneeId = patch.assigneeId;
      if (patch.dueAt) tk.dueAt = Number(patch.dueAt);
      if (patch.snoozeMin) { tk.remindAt = now() + patch.snoozeMin * 60000; tk.reminded = false; }
      commit(['tasks', 'interactions']); return Object.assign({}, tk);
    },
    dashboard() {
      need('crm.view');
      const t = now(), DAY = 86400000;
      const leads = db.clients.filter((c) => ['new', 'contacted', 'qualified'].indexOf(c.stage) >= 0);
      const funded = db.clients.filter((c) => ['funded', 'active'].indexOf(c.stage) >= 0);
      const regs = Array.from({ length: 14 }, (_, i) => { const d0 = Math.floor(t / DAY) * DAY - (13 - i) * DAY; return { t: d0, n: db.clients.filter((c) => c.createdAt >= d0 && c.createdAt < d0 + DAY).length }; });
      const deps = Array.from({ length: 14 }, (_, i) => { const d0 = Math.floor(t / DAY) * DAY - (13 - i) * DAY; return { t: d0, usd: U.sum(db.payments.filter((p) => p.type === 'deposit' && p.status === 'completed' && p.completedAt >= d0 && p.completedAt < d0 + DAY), (p) => p.amountUsd) }; });
      const aum = U.sum(db.accounts, (a) => L.accountSummary(db, a.id, t).equity);
      const stages = {}; db.clients.forEach((c) => { stages[c.stage] = (stages[c.stage] || 0) + 1; });
      return {
        totalClients: db.clients.length, leads: leads.length, funded: funded.length,
        active: db.clients.filter((c) => c.stage === 'active').length,
        conversion: db.clients.length ? funded.length / db.clients.length * 100 : 0,
        aum, deposits30: U.sum(db.payments.filter((p) => p.type === 'deposit' && p.status === 'completed' && p.completedAt > t - 30 * DAY), (p) => p.amountUsd),
        trades24: db.trades.filter((x) => x.at > t - DAY).length, volume30: U.sum(db.trades.filter((x) => x.at > t - 30 * DAY), (x) => x.notionalUsd),
        openTickets: db.tickets.filter((x) => x.status === 'open' || x.status === 'in_progress').length,
        overdueTasks: db.tasks.filter((x) => x.status === 'open' && x.dueAt < t).length,
        todayTasks: db.tasks.filter((x) => x.status === 'open' && x.dueAt >= t - (t % DAY) && x.dueAt < t - (t % DAY) + DAY).length,
        pendingWithdrawals: db.payments.filter((p) => p.type === 'withdrawal' && p.status === 'review').length,
        regs, deps, stages,
        managers: db.staff.filter((s) => s.role === 'manager').map((s) => ({ id: s.id, name: s.name, clients: db.clients.filter((c) => c.managerId === s.id).length, funded: db.clients.filter((c) => c.managerId === s.id && ['funded', 'active'].indexOf(c.stage) >= 0).length }))
      };
    },

    /* admin */
    staff() { need('crm.view'); return db.staff.slice(); },
    roles() { return U.deepClone(db.roles); },
    saveStaff(data) {
      need('admin.staff');
      if (!data.name || String(data.name).trim().length < 2) throw err('err.name');
      if (!U.isEmail(data.email)) throw err('err.email');
      if (!db.roles.some((r) => r.id === data.role) || data.role === 'client') throw err('err.role');
      if (data.id) { const s = db.staff.find((x) => x.id === data.id); Object.assign(s, { name: data.name.trim(), email: data.email.trim(), role: data.role, phone: data.phone || '', active: data.active !== false }); }
      else { const n = db.staff.length + 1; db.staff.push({ id: 'ST-' + String(n).padStart(2, '0') + U.uid('').slice(-2), name: data.name.trim(), email: data.email.trim(), role: data.role, phone: data.phone || '', active: true }); }
      commit(['staff']); return db.staff.slice();
    },
    setRolePermission(roleId, perm, on) {
      need('admin.roles');
      const r = db.roles.find((x) => x.id === roleId); if (!r) throw err('err.notFound');
      if (roleId === 'admin' && (perm === 'admin.roles' || perm === 'admin.settings') && !on) throw err('err.lockout');
      const i = r.permissions.indexOf(perm);
      if (on && i < 0) r.permissions.push(perm); if (!on && i >= 0) r.permissions.splice(i, 1);
      commit(['roles']); return U.deepClone(db.roles);
    },
    setInstrument(id, patch) {
      need('admin.instruments');
      const o = db.settings.instruments[id] = Object.assign({}, db.settings.instruments[id] || {});
      if (patch.enabled != null) o.enabled = !!patch.enabled;
      if (patch.spreadBps != null) { const v = Number(patch.spreadBps); if (!(v >= 0 && v <= 500)) throw err('err.range'); o.spreadBps = v; }
      if (patch.feeRate !== undefined) { if (patch.feeRate === null || patch.feeRate === '') delete o.feeRate; else { const v = Number(patch.feeRate); if (!(v >= 0 && v <= 0.05)) throw err('err.range'); o.feeRate = v; } }
      configureMarket(); commit(['settings']); return true;
    },
    setMarketEnabled(market, on) { need('admin.instruments'); db.settings.markets[market] = !!on; commit(['settings']); return true; },
    setFees(fees, withdrawFees, limits) {
      need('admin.fees');
      Object.keys(fees || {}).forEach((m) => { const f = fees[m]; if (!(f.rate >= 0 && f.rate <= 0.05 && f.min >= 0 && f.min <= 100)) throw err('err.range'); });
      if (fees) db.settings.fees = fees;
      if (withdrawFees) db.settings.withdrawFees = withdrawFees;
      if (limits) Object.assign(db.settings, limits);
      commit(['settings']); return true;
    },
    settings() { return U.deepClone(db.settings); },
    saveSettings(patch) {
      need('admin.settings');
      ['platformName', 'supportEmail'].forEach((k) => { if (patch[k] != null) db.settings[k] = String(patch[k]).slice(0, 80); });
      if (patch.startBalance != null) { const v = Number(patch.startBalance); if (!(v >= 0 && v <= 1e7)) throw err('err.range'); db.settings.startBalance = v; }
      if (patch.latencyMs != null) db.settings.latencyMs = U.clamp(Number(patch.latencyMs) || 0, 0, 3000);
      if (patch.failRate != null) db.settings.failRate = U.clamp(Number(patch.failRate) || 0, 0, 0.5);
      commit(['settings']); return U.deepClone(db.settings);
    },
    setClock(action) {
      if (action === 'pause') NX.market.pause(); else NX.market.resume();
      db.settings.clock = NX.market.getClock(); commit(['settings']); return db.settings.clock;
    },
    resetDemo() {
      const seed = db.settings.seed;
      db = NX.seed.build({ seed });
      persist();
      NX.bus.emit('db:change', { cols: ['*'], remote: false });
      return true;
    },
    transport: () => ({ latencyMs: db.settings.latencyMs, failRate: db.settings.failRate })
  };

  NX.server = S;
})(window.NX);
