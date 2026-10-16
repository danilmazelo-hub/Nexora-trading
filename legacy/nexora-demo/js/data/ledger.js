/* NEXORA ledger: pure accounting rules over a db snapshot (used by the demo server and the seed builder).
   In production these rules MUST run on the backend; the frontend only previews them. */
(function (NX) {
  'use strict';
  const U = NX.util;
  const EPS = 1e-9;

  const L = {};

  L.nextId = (db, prefix) => {
    db.counters[prefix] = (db.counters[prefix] || 1000) + 1;
    return prefix + '-' + db.counters[prefix];
  };

  L.instrumentEnabled = (db, inst) => {
    const o = (db.settings.instruments || {})[inst.id];
    return !(o && o.enabled === false) && (db.settings.markets || {})[inst.market] !== false;
  };

  L.feeFor = (db, inst, notionalUsd) => {
    const f = (db.settings.fees || {})[inst.market] || { rate: 0.001, min: 0 };
    const o = (db.settings.instruments || {})[inst.id];
    const rate = o && o.feeRate != null ? o.feeRate : f.rate;
    return Math.max(f.min || 0, notionalUsd * rate);
  };

  L.toUsd = (amount, ccy, t) => NX.market.toUsd(amount, ccy, t);

  L.position = (db, accountId, instrumentId) => db.positions.find((p) => p.accountId === accountId && p.instrumentId === instrumentId) || null;

  // Cash locked by open BUY limit orders and quantity locked by open SELL limit orders.
  L.reservedCash = (db, accountId) => U.sum(db.orders.filter((o) => o.accountId === accountId && o.status === 'open' && o.side === 'buy'), (o) => o.reservedUsd || 0);
  L.reservedQty = (db, accountId, instrumentId) => U.sum(db.orders.filter((o) => o.accountId === accountId && o.instrumentId === instrumentId && o.status === 'open' && o.side === 'sell'), (o) => o.qty);

  L.valuePosition = (p, t) => {
    const inst = NX.catalog.get(p.instrumentId);
    const q = NX.market.quote(p.instrumentId, t);
    const valueUsd = L.toUsd(p.qty * q.bid, inst.quote, t);
    const pnlUsd = valueUsd - p.costUsd;
    return Object.assign({}, p, {
      symbol: inst.symbol, name: inst.name, market: inst.market, quoteCcy: inst.quote,
      price: q.bid, mid: q.mid, changePct: q.changePct, valueUsd, pnlUsd, pnlPct: p.costUsd > 0 ? pnlUsd / p.costUsd * 100 : 0
    });
  };

  L.accountSummary = (db, accountId, t) => {
    const acc = db.accounts.find((a) => a.id === accountId);
    if (!acc) return null;
    const positions = db.positions.filter((p) => p.accountId === accountId).map((p) => L.valuePosition(p, t));
    const reserved = L.reservedCash(db, accountId);
    const invested = U.sum(positions, (p) => p.valueUsd);
    const cost = U.sum(positions, (p) => p.costUsd);
    const trades = db.trades.filter((x) => x.accountId === accountId);
    const pendingOut = U.sum(db.payments.filter((p) => p.accountId === accountId && p.type === 'withdrawal' && (p.status === 'review' || p.status === 'processing')), (p) => p.holdUsd || 0);
    return {
      account: Object.assign({}, acc),
      cash: acc.cash, reservedCash: reserved, available: Math.max(0, acc.cash - reserved), pendingWithdrawalsUsd: pendingOut,
      positionsValue: invested, equity: acc.cash + invested, unrealizedPnl: invested - cost,
      realizedPnl: U.sum(trades, (x) => x.realizedPnl || 0), feesPaid: U.sum(trades, (x) => x.fee || 0),
      positions
    };
  };

  /* Validates an order request against current balances. Returns { ok, errors, ...calc }.
     req: { instrumentId, side: 'buy'|'sell', type: 'market'|'limit', qty, limitPrice } */
  L.preview = (db, accountId, req, t) => {
    const errors = [];
    const inst = NX.catalog.get(req.instrumentId);
    if (!inst) return { ok: false, errors: ['err.instrument'] };
    const acc = db.accounts.find((a) => a.id === accountId);
    if (!acc) return { ok: false, errors: ['err.noAccount'] };
    if (acc.status === 'blocked') errors.push('err.accountBlocked');
    if (!L.instrumentEnabled(db, inst)) errors.push('err.instrumentDisabled');
    const q = NX.market.quote(inst.id, t);
    const type = req.type === 'limit' ? 'limit' : 'market';
    const side = req.side === 'sell' ? 'sell' : 'buy';
    const mkt = side === 'buy' ? q.ask : q.bid;
    let price = type === 'limit' ? Number(req.limitPrice) : mkt;
    if (type === 'limit' && !(price > 0)) { errors.push('err.limitPrice'); price = mkt; }
    // A limit already through the market (buy limit >= ask, sell limit <= bid) fills immediately at the
    // market price — the client never pays more / receives less than the market because of a typo.
    const marketable = type === 'limit' && price > 0 && (side === 'buy' ? price >= mkt : price <= mkt);
    const limitPrice = type === 'limit' ? price : null;
    if (marketable) price = mkt;
    const farFromMarket = type === 'limit' && price > 0 && !marketable && Math.abs(price / mkt - 1) > 0.5;
    const step = inst.qtyStep;
    const qty = U.floorTo(Math.max(0, Number(req.qty) || 0), step);
    if (!(qty > 0)) errors.push('err.qty');
    const fxRate = L.toUsd(1, inst.quote, t);
    const notionalUsd = qty * price * fxRate;
    const fee = qty > 0 ? L.feeFor(db, inst, notionalUsd) : 0;
    const available = Math.max(0, acc.cash - L.reservedCash(db, accountId));
    const pos = L.position(db, accountId, inst.id);
    const posQty = pos ? pos.qty : 0;
    const availableQty = Math.max(0, posQty - L.reservedQty(db, accountId, inst.id));
    const minNotional = (db.settings.minOrderUsd || 1);
    if (qty > 0 && notionalUsd < minNotional) errors.push('err.minNotional');
    let totalUsd, estPnl = null, availableAfter = available;
    if (side === 'buy') {
      totalUsd = notionalUsd + fee;
      if (qty > 0 && totalUsd > available + 1e-6) errors.push('err.funds');
      availableAfter = available - totalUsd;
    } else {
      totalUsd = notionalUsd - fee;
      if (qty > 0 && qty > availableQty + step * 1e-6) errors.push(posQty > 0 ? 'err.qtyExceeds' : 'err.noPosition');
      if (pos && posQty > 0) estPnl = totalUsd - pos.costUsd * Math.min(1, qty / posQty);
      availableAfter = available + (type === 'market' ? totalUsd : 0);
    }
    if (side === 'sell' && marketable) availableAfter = available + totalUsd;
    return { ok: errors.length === 0, errors, instrumentId: inst.id, side, type, qty, price, limitPrice, marketable, farFromMarket, quote: q, fxRate, notionalUsd, fee, totalUsd, available, availableAfter, positionQty: posQty, availableQty, estPnl };
  };

  // Applies a fill to cash/positions and records the trade. Caller has validated the order.
  L.applyFill = (db, order, price, t) => {
    const inst = NX.catalog.get(order.instrumentId);
    const acc = db.accounts.find((a) => a.id === order.accountId);
    const fxRate = L.toUsd(1, inst.quote, t);
    const notionalUsd = order.qty * price * fxRate;
    const fee = L.feeFor(db, inst, notionalUsd);
    let pos = L.position(db, acc.id, inst.id);
    let realizedPnl = null;
    if (order.side === 'buy') {
      acc.cash -= notionalUsd + fee;
      if (!pos) { pos = { id: L.nextId(db, 'PS'), accountId: acc.id, clientId: acc.clientId, instrumentId: inst.id, qty: 0, avgPrice: 0, costUsd: 0, openedAt: t }; db.positions.push(pos); }
      const newQty = U.round(pos.qty + order.qty, 10);
      pos.avgPrice = (pos.avgPrice * pos.qty + price * order.qty) / newQty;
      pos.qty = newQty;
      pos.costUsd += notionalUsd + fee;
      pos.updatedAt = t;
    } else {
      const share = Math.min(1, order.qty / pos.qty);
      const costPart = pos.costUsd * share;
      realizedPnl = notionalUsd - fee - costPart;
      acc.cash += notionalUsd - fee;
      pos.qty = U.round(pos.qty - order.qty, 10);
      pos.costUsd -= costPart;
      pos.updatedAt = t;
      // A fully sold position disappears.
      if (pos.qty < inst.qtyStep / 2 + EPS) db.positions.splice(db.positions.indexOf(pos), 1);
    }
    acc.updatedAt = t;
    const trade = {
      id: L.nextId(db, 'TR'), orderId: order.id, accountId: acc.id, clientId: acc.clientId, instrumentId: inst.id,
      side: order.side, type: order.type, qty: order.qty, price, quoteCcy: inst.quote, fxRate, notionalUsd, fee, realizedPnl, at: t
    };
    db.trades.push(trade);
    order.status = 'filled'; order.filledAt = t; order.fillPrice = price; order.updatedAt = t; order.reservedUsd = 0;
    const client = db.clients.find((c) => c.id === acc.clientId);
    if (client) { client.lastActivityAt = t; if (client.stage === 'funded') client.stage = 'active'; }
    return trade;
  };

  L.notify = (db, clientId, kind, key, vars, t) => {
    db.notifications.push({ id: L.nextId(db, 'NF'), clientId, kind, key, vars: vars || {}, at: t || NX.market.now(), read: false });
  };
  L.interaction = (db, clientId, type, text, staffId, t, vars) => {
    db.interactions.push({ id: L.nextId(db, 'IN'), clientId, type, text: text || '', key: null, vars: vars || null, staffId: staffId || null, at: t || NX.market.now() });
  };
  L.systemEvent = (db, clientId, key, vars, t, staffId) => {
    db.interactions.push({ id: L.nextId(db, 'IN'), clientId, type: 'system', text: '', key, vars: vars || {}, staffId: staffId || null, at: t || NX.market.now() });
  };

  // Crypto assets accepted for simulated deposits/withdrawals, with networks.
  L.WALLET_ASSETS = {
    USDT: { networks: ['TRC20', 'ERC20'], priceId: null, decimals: 2 },
    USDC: { networks: ['ERC20'], priceId: null, decimals: 2 },
    BTC: { networks: ['BTC'], priceId: 'BTC/USD', decimals: 6 },
    ETH: { networks: ['ERC20'], priceId: 'ETH/USD', decimals: 5 }
  };
  L.assetUsd = (asset, t) => { const a = L.WALLET_ASSETS[asset]; return a && a.priceId ? NX.market.price(a.priceId, t) : 1; };
  L.ADDRESS_RULES = {
    BTC: /^(bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
    ERC20: /^0x[a-fA-F0-9]{40}$/,
    TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/
  };

  NX.ledger = L;
})(window.NX);
