/* NEXORA demo seed: builds a consistent demo database.
   Trades are replayed through the same ledger rules at historical simulated prices,
   so balances, positions, trades and payments always reconcile. */
(function (NX) {
  'use strict';
  const U = NX.util, L = NX.ledger, DAY = 86400000;
  const DB_VERSION = 5;

  // Free-text demo content in three languages: rendered with NX.ui.txt().
  const tx = (ru, uk, en) => ({ ru, uk, en });

  const ROLES = [
    { id: 'client', name: tx('Клиент', 'Клієнт', 'Client'), system: true,
      permissions: ['terminal.trade', 'cabinet.view'] },
    { id: 'manager', name: tx('Менеджер', 'Менеджер', 'Manager'), system: true,
      permissions: ['crm.view', 'crm.clients.create', 'crm.clients.edit', 'crm.assign', 'crm.notes', 'crm.tasks', 'crm.tickets', 'market.view'] },
    { id: 'support', name: tx('Поддержка', 'Підтримка', 'Support'), system: false,
      permissions: ['crm.view', 'crm.notes', 'crm.tickets', 'market.view'] },
    { id: 'admin', name: tx('Администратор', 'Адміністратор', 'Administrator'), system: true,
      permissions: ['crm.view', 'crm.clients.create', 'crm.clients.edit', 'crm.assign', 'crm.notes', 'crm.tasks', 'crm.tickets', 'market.view',
        'payments.approve', 'admin.staff', 'admin.roles', 'admin.instruments', 'admin.fees', 'admin.settings', 'demo.reset'] }
  ];
  const STAFF = [
    { id: 'ST-01', name: 'Anna Kovalenko', email: 'anna.kovalenko@nexora.demo', role: 'manager', active: true, phone: '+380 44 000 0101' },
    { id: 'ST-02', name: 'Igor Melnyk', email: 'igor.melnyk@nexora.demo', role: 'manager', active: true, phone: '+380 44 000 0102' },
    { id: 'ST-03', name: 'Sofia Lysenko', email: 'sofia.lysenko@nexora.demo', role: 'manager', active: true, phone: '+380 44 000 0103' },
    { id: 'ST-04', name: 'Max Petrenko', email: 'max.petrenko@nexora.demo', role: 'support', active: true, phone: '+380 44 000 0104' },
    { id: 'ST-05', name: 'Dmytro Hrytsenko', email: 'dmytro.hrytsenko@nexora.demo', role: 'admin', active: true, phone: '+380 44 000 0105' }
  ];
  const FIRST = ['Maria', 'Dmytro', 'Olena', 'John', 'Emma', 'Ivan', 'Sofia', 'Andrii', 'Kateryna', 'Michael', 'Anna', 'Serhii', 'Yulia', 'David',
    'Natalia', 'Oleksandr', 'Iryna', 'Peter', 'Laura', 'Mykola', 'Tetiana', 'Robert', 'Viktoria', 'Artem', 'Daria', 'Lucas', 'Polina', 'Taras', 'Elena', 'Marco'];
  const LAST = ['Ivanova', 'Shevchenko', 'Bondar', 'Miller', 'Schneider', 'Petrov', 'Kravets', 'Novak', 'Wagner', 'Tkachenko', 'Moroz', 'Fischer',
    'Popova', 'Koval', 'Smith', 'Rossi', 'Savchenko', 'Zhuk', 'Brown', 'Klymenko', 'Volkov', 'Marchenko', 'Weber', 'Romanenko', 'Horbunov', 'Kuznetsova'];
  const COUNTRIES = ['UA', 'PL', 'DE', 'CZ', 'LT', 'LV', 'EE', 'ES', 'IT', 'GB', 'CY', 'AE', 'KZ', 'GE', 'MD'];
  const SOURCES = ['website', 'referral', 'ads', 'partner', 'event'];
  const POPULAR = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'XAU/USD', 'XAG/USD', 'USOIL', 'EUR/USD', 'GBP/USD', 'SPX', 'NDX', 'GDAXI', 'BNB/USD', 'LINK/USD', 'META'];

  const NOTE_TEXTS = [
    tx('Интересуется криптовалютой, просит обзор рисков.', 'Цікавиться криптовалютою, просить огляд ризиків.', 'Interested in crypto, asked for a risk overview.'),
    tx('Перезвонить после 18:00, предпочитает Telegram.', 'Передзвонити після 18:00, віддає перевагу Telegram.', 'Call back after 18:00, prefers Telegram.'),
    tx('Опытный трейдер акций, хочет низкие комиссии.', 'Досвідчений трейдер акцій, хоче низькі комісії.', 'Experienced stock trader, wants low fees.'),
    tx('Сомневается насчёт верификации, отправить инструкцию.', 'Вагається щодо верифікації, надіслати інструкцію.', 'Hesitant about verification, send instructions.'),
    tx('Крупный потенциальный депозит, держать в приоритете.', 'Великий потенційний депозит, тримати в пріоритеті.', 'Large potential deposit, keep as priority.')
  ];
  const TASK_TEXTS = [
    tx('Позвонить и рассказать о платформе', 'Зателефонувати та розповісти про платформу', 'Call and introduce the platform'),
    tx('Отправить инструкцию по верификации', 'Надіслати інструкцію з верифікації', 'Send verification instructions'),
    tx('Уточнить цели инвестирования', 'Уточнити інвестиційні цілі', 'Clarify investment goals'),
    tx('Предложить обучающий вебинар', 'Запропонувати навчальний вебінар', 'Offer a training webinar'),
    tx('Проверить статус первого пополнения', 'Перевірити статус першого поповнення', 'Check first deposit status')
  ];
  const CALL_TEXTS = [
    tx('Вводный звонок: рассказал о демо-счёте.', 'Вступний дзвінок: розповів про демо-рахунок.', 'Intro call: explained the demo account.'),
    tx('Обсудили комиссии по акциям.', 'Обговорили комісії за акціями.', 'Discussed stock trading fees.'),
    tx('Клиент попросил перезвонить позже.', 'Клієнт попросив передзвонити пізніше.', 'Client asked to call back later.')
  ];

  function defaultSettings(seed) {
    return {
      seed, clock: { offset: 0, pausedAt: null },
      platformName: 'NEXORA Trading', supportEmail: 'support@nexora.demo',
      startBalance: 10000, minOrderUsd: 1, minDepositUsd: 10, maxDepositUsd: 100000, minWithdrawUsd: 20,
      fees: {
        crypto: { rate: 0.001, min: 0.5 }, stocks: { rate: 0.0005, min: 1 }, indices: { rate: 0.0003, min: 1 },
        forex: { rate: 0.0002, min: 0.5 }, commodities: { rate: 0.0004, min: 1 }
      },
      withdrawFees: { 'USDT:TRC20': 1, 'USDT:ERC20': 4, 'USDC:ERC20': 4, 'BTC:BTC': 0.0002, 'ETH:ERC20': 0.0015 },
      markets: { crypto: true, stocks: true, indices: true, forex: true, commodities: true },
      instruments: {},
      latencyMs: 180, failRate: 0
    };
  }

  function build(opts) {
    opts = opts || {};
    const seed = opts.seed || 20261015;
    const db = {
      version: DB_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
      settings: defaultSettings(seed),
      counters: { CL: 1000, AC: 50000, OR: 700000, TR: 900000, PM: 300000, PS: 100, NT: 5000, TK: 6000, SR: 2000, IN: 10000, NF: 40000, MS: 1 },
      roles: U.deepClone(ROLES), staff: U.deepClone(STAFF),
      clients: [], accounts: [], positions: [], orders: [], trades: [], payments: [],
      notes: [], tasks: [], interactions: [], tickets: [], notifications: []
    };
    if (opts.clock) db.settings.clock = opts.clock;
    NX.market.configure({ seed, clock: db.settings.clock, spreads: {} });
    const T = NX.market.now();
    const rnd = U.rng(seed);

    const mkClient = (c) => {
      const id = L.nextId(db, 'CL');
      const client = Object.assign({ id, phone: '', country: 'UA', language: 'ru', source: 'website', tags: [], kyc: 'none', accountId: null, lastActivityAt: c.createdAt, updatedAt: c.createdAt }, c);
      db.clients.push(client);
      return client;
    };
    const mkAccount = (client, t) => {
      const acc = { id: L.nextId(db, 'AC'), clientId: client.id, currency: 'USD', type: 'demo', cash: 0, status: 'active', createdAt: t, updatedAt: t };
      db.accounts.push(acc); client.accountId = acc.id; return acc;
    };
    const deposit = (client, acc, asset, amount, t, network) => {
      const usd = amount * L.assetUsd(asset, t);
      acc.cash += usd;
      const p = { id: L.nextId(db, 'PM'), clientId: client.id, accountId: acc.id, type: 'deposit', asset, network: network || L.WALLET_ASSETS[asset].networks[0], amount, amountUsd: usd, fee: 0, status: 'completed', ref: 'SIM-' + U.mix(seed, t % 1e9, 3).toString(16).toUpperCase().slice(0, 8), createdAt: t, completedAt: t + 20 * 60000, history: [{ status: 'awaiting', at: t }, { status: 'confirming', at: t + 5 * 60000 }, { status: 'completed', at: t + 20 * 60000 }] };
      db.payments.push(p);
      L.systemEvent(db, client.id, 'ev.deposit', { amount: U.round(amount, 6), asset }, t);
      return p;
    };
    const trade = (client, acc, instId, side, qty, t) => {
      const pv = L.preview(db, acc.id, { instrumentId: instId, side, type: 'market', qty }, t);
      if (!pv.ok) return null;
      const order = { id: L.nextId(db, 'OR'), accountId: acc.id, clientId: client.id, instrumentId: instId, side, type: 'market', qty: pv.qty, limitPrice: null, status: 'new', createdAt: t, updatedAt: t };
      db.orders.push(order);
      return L.applyFill(db, order, pv.price, t);
    };

    /* ---------- Demo client (the "logged in" cabinet user) ---------- */
    const demo = mkClient({ name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+380 67 000 1234', country: 'UA', language: 'ru', stage: 'active', managerId: 'ST-01', source: 'website', kyc: 'verified', createdAt: T - 75 * DAY, tags: ['VIP', 'crypto'] });
    const dAcc = mkAccount(demo, T - 75 * DAY);
    L.systemEvent(db, demo.id, 'ev.registered', {}, T - 75 * DAY);
    deposit(demo, dAcc, 'USDT', 25000, T - 74 * DAY, 'TRC20');
    trade(demo, dAcc, 'BTC/USD', 'buy', 0.06, T - 70 * DAY);
    trade(demo, dAcc, 'ETH/USD', 'buy', 1.2, T - 60 * DAY);
    trade(demo, dAcc, 'AAPL', 'buy', 10, T - 45 * DAY);
    deposit(demo, dAcc, 'BTC', 0.075, T - 42 * DAY, 'BTC');
    trade(demo, dAcc, 'XAU/USD', 'buy', 1, T - 40 * DAY);
    trade(demo, dAcc, 'BTC/USD', 'sell', 0.02, T - 20 * DAY);
    trade(demo, dAcc, 'EUR/USD', 'buy', 1000, T - 10 * DAY);
    trade(demo, dAcc, 'SOL/USD', 'buy', 8, T - 3 * DAY);
    trade(demo, dAcc, 'NVDA', 'buy', 6, T - 1 * DAY);
    // Completed simulated withdrawal
    const wUsd = 500 + 1;
    dAcc.cash -= wUsd;
    db.payments.push({ id: L.nextId(db, 'PM'), clientId: demo.id, accountId: dAcc.id, type: 'withdrawal', asset: 'USDT', network: 'TRC20', amount: 500, amountUsd: 500, fee: 1, holdUsd: wUsd, address: 'TQ7mZ9…4xLk2a', status: 'completed', ref: 'SIM-7A21C9F0', createdAt: T - 15 * DAY, completedAt: T - 15 * DAY + 3 * 3600000, history: [{ status: 'review', at: T - 15 * DAY }, { status: 'processing', at: T - 15 * DAY + 2 * 3600000, by: 'ST-05' }, { status: 'completed', at: T - 15 * DAY + 3 * 3600000 }] });
    // An open limit order and a cancelled one
    const ethPx = NX.market.price('ETH/USD', T);
    const limitPx = U.round(ethPx * 0.93, 2);
    const lim = { id: L.nextId(db, 'OR'), accountId: dAcc.id, clientId: demo.id, instrumentId: 'ETH/USD', side: 'buy', type: 'limit', qty: 0.3, limitPrice: limitPx, status: 'open', createdAt: T - 2 * 3600000, updatedAt: T - 2 * 3600000 };
    lim.reservedUsd = lim.qty * limitPx + L.feeFor(db, NX.catalog.get('ETH/USD'), lim.qty * limitPx);
    if (lim.reservedUsd < dAcc.cash) db.orders.push(lim);
    db.orders.push({ id: L.nextId(db, 'OR'), accountId: dAcc.id, clientId: demo.id, instrumentId: 'TSLA', side: 'buy', type: 'limit', qty: 5, limitPrice: U.round(NX.market.price('TSLA', T - 5 * DAY) * 0.9, 2), status: 'cancelled', createdAt: T - 6 * DAY, updatedAt: T - 5 * DAY, reservedUsd: 0 });

    /* ---------- Other clients and leads ---------- */
    const stagePlan = ['new', 'new', 'new', 'new', 'new', 'contacted', 'contacted', 'contacted', 'contacted', 'qualified', 'qualified', 'qualified',
      'registered', 'registered', 'registered', 'registered', 'funded', 'funded', 'funded', 'funded', 'active', 'active', 'active', 'active', 'active',
      'active', 'active', 'active', 'active', 'active', 'lost', 'lost', 'lost', 'contacted', 'new', 'registered', 'funded', 'active', 'qualified', 'new', 'active'];
    const managers = ['ST-01', 'ST-02', 'ST-03'];
    stagePlan.forEach((stage, i) => {
      const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + 3) % LAST.length];
      const recent = rnd() < 0.45;
      const createdAt = T - (recent ? rnd.int(0, 13) : rnd.int(14, 160)) * DAY - rnd.int(0, 86000) * 1000;
      const isLead = stage === 'new' || stage === 'contacted' || stage === 'qualified' || (stage === 'lost' && rnd() < 0.5);
      const c = mkClient({
        name: first + ' ' + last, email: (first + '.' + last).toLowerCase() + (i % 3 ? '@example.com' : '@mail.test'),
        phone: '+' + rnd.int(30, 49) + ' ' + rnd.int(10, 99) + ' ' + rnd.int(100, 999) + ' ' + rnd.int(1000, 9999),
        country: rnd.pick(COUNTRIES), language: rnd.pick(['ru', 'uk', 'en']), stage,
        managerId: stage === 'new' && rnd() < 0.5 ? null : rnd.pick(managers), source: rnd.pick(SOURCES), createdAt,
        kyc: isLead ? 'none' : stage === 'registered' ? rnd.pick(['none', 'pending']) : rnd.pick(['verified', 'verified', 'pending']),
        tags: rnd() < 0.2 ? ['VIP'] : []
      });
      L.systemEvent(db, c.id, isLead ? 'ev.leadCreated' : 'ev.registered', { source: c.source }, createdAt);
      if (rnd() < 0.6 && c.managerId) L.interaction(db, c.id, 'call', rnd.pick(CALL_TEXTS), c.managerId, Math.min(T - 3600000, createdAt + rnd.int(1, 48) * 3600000));
      if (rnd() < 0.5 && c.managerId) db.notes.push({ id: L.nextId(db, 'NT'), clientId: c.id, staffId: c.managerId, text: rnd.pick(NOTE_TEXTS), at: Math.min(T - 1800000, createdAt + rnd.int(2, 72) * 3600000), pinned: false });
      if (isLead) return;
      const acc = mkAccount(c, createdAt);
      if (stage === 'funded' || stage === 'active' || stage === 'lost') {
        const nDep = rnd.int(1, 3);
        let t = createdAt + rnd.int(2, 30) * 3600000;
        for (let k = 0; k < nDep && t < T; k++) {
          const asset = rnd.pick(['USDT', 'USDT', 'USDC', 'BTC', 'ETH']);
          const usd = rnd.pick([500, 1000, 2500, 5000, 10000, 25000, 50000]);
          deposit(c, acc, asset, U.round(usd / L.assetUsd(asset, t), asset === 'BTC' ? 5 : asset === 'ETH' ? 4 : 0), t, null);
          t += rnd.int(1, 20) * DAY;
        }
      }
      if (stage === 'active' || (stage === 'lost' && rnd() < 0.5)) {
        const nTr = rnd.int(3, 9);
        const span = Math.max(DAY, T - createdAt - DAY);
        const times = Array.from({ length: nTr }, () => createdAt + DAY + rnd() * span).sort((a, b) => a - b);
        times.forEach((t) => {
          const held = db.positions.filter((p) => p.accountId === acc.id);
          if (held.length && rnd() < 0.3) {
            const p = rnd.pick(held), inst = NX.catalog.get(p.instrumentId);
            const part = rnd() < 0.4 ? p.qty : U.floorTo(p.qty * (0.3 + rnd() * 0.5), inst.qtyStep);
            trade(c, acc, p.instrumentId, 'sell', part, t);
          } else {
            const id = rnd.pick(POPULAR), inst = NX.catalog.get(id);
            const px = NX.market.price(id, t) * NX.market.toUsd(1, inst.quote, t);
            const budget = acc.cash * (0.08 + rnd() * 0.25);
            const qty = U.floorTo(budget / px, inst.qtyStep);
            if (qty > 0) trade(c, acc, id, 'buy', qty, t);
          }
        });
      }
    });
    // Normalise "active" leads that ended up without trades.
    db.clients.forEach((c) => { if (c.stage === 'active' && !db.trades.some((x) => x.clientId === c.id)) c.stage = 'funded'; });

    /* ---------- Tasks, tickets, notifications ---------- */
    const crmClients = db.clients.filter((c) => c.managerId);
    crmClients.slice(0, 16).forEach((c, i) => {
      const due = T + (i % 4 === 0 ? -1 : i % 4 === 1 ? 0.2 : i % 4 === 2 ? 1 : 3) * DAY + i * 3600000;
      db.tasks.push({ id: L.nextId(db, 'TK'), clientId: c.id, title: TASK_TEXTS[i % TASK_TEXTS.length], type: ['call', 'email', 'todo', 'meeting'][i % 4], dueAt: due, remindAt: due - 30 * 60000, assigneeId: c.managerId, status: i % 5 === 4 ? 'done' : 'open', priority: ['normal', 'high', 'low'][i % 3], createdAt: T - 2 * DAY, createdBy: c.managerId, reminded: due - 30 * 60000 < T });
    });
    db.tasks.push({ id: L.nextId(db, 'TK'), clientId: demo.id, title: tx('Предложить демо-обзор рынка металлов', 'Запропонувати демо-огляд ринку металів', 'Offer a demo metals market review'), type: 'call', dueAt: T + 4 * 3600000, remindAt: T + 3.5 * 3600000, assigneeId: 'ST-01', status: 'open', priority: 'high', createdAt: T - DAY, createdBy: 'ST-01', reminded: false });
    db.notes.push({ id: L.nextId(db, 'NT'), clientId: demo.id, staffId: 'ST-01', text: tx('VIP-клиент. Внутренняя заметка: не видна клиенту в кабинете.', 'VIP-клієнт. Внутрішня нотатка: не видна клієнту в кабінеті.', 'VIP client. Internal note: not visible to the client in the cabinet.'), at: T - 5 * DAY, pinned: true });
    L.interaction(db, demo.id, 'call', CALL_TEXTS[1], 'ST-01', T - 30 * DAY);
    L.interaction(db, demo.id, 'email', tx('Отправлено письмо с обзором новых инструментов.', 'Надіслано лист з оглядом нових інструментів.', 'Sent an email about new instruments.'), 'ST-01', T - 8 * DAY);

    const ticket = (client, subject, cat, status, msgs, t, assignee) => {
      const tk = { id: L.nextId(db, 'SR'), clientId: client.id, subject, category: cat, status, priority: 'normal', assigneeId: assignee || null, createdAt: t, updatedAt: msgs[msgs.length - 1].at, messages: msgs.map((m) => Object.assign({ id: L.nextId(db, 'MS') }, m)) };
      db.tickets.push(tk); return tk;
    };
    ticket(demo, tx('Как пополнить счёт криптовалютой?', 'Як поповнити рахунок криптовалютою?', 'How do I fund my account with crypto?'), 'payments', 'resolved', [
      { author: 'client', text: tx('Подскажите, какие сети поддерживаются для USDT?', 'Підкажіть, які мережі підтримуються для USDT?', 'Which networks are supported for USDT?'), at: T - 73 * DAY },
      { author: 'staff', staffId: 'ST-04', text: tx('В демо доступны TRC20 и ERC20. Все переводы — симуляция.', 'У демо доступні TRC20 та ERC20. Усі перекази — симуляція.', 'TRC20 and ERC20 are available in the demo. All transfers are simulated.'), at: T - 73 * DAY + 3600000 }
    ], T - 73 * DAY, 'ST-04');
    ticket(demo, tx('Вопрос по комиссии за акции', 'Питання щодо комісії за акції', 'Question about stock fees'), 'trading', 'open', [
      { author: 'client', text: tx('Какая минимальная комиссия по акциям?', 'Яка мінімальна комісія за акціями?', 'What is the minimum fee for stocks?'), at: T - 6 * 3600000 }
    ], T - 6 * 3600000, null);
    db.clients.filter((c) => c.accountId && c.id !== demo.id).slice(0, 5).forEach((c, i) => {
      ticket(c, [tx('Не проходит верификация', 'Не проходить верифікація', 'Verification is stuck'), tx('Вопрос по выводу средств', 'Питання щодо виведення коштів', 'Withdrawal question'), tx('Ошибка на графике', 'Помилка на графіку', 'Chart issue')][i % 3],
        ['kyc', 'payments', 'technical'][i % 3], ['open', 'in_progress', 'open', 'resolved', 'in_progress'][i], [
          { author: 'client', text: tx('Прошу помочь, спасибо.', 'Прошу допомогти, дякую.', 'Please help, thank you.'), at: T - (i + 1) * 9 * 3600000 }
        ], T - (i + 1) * 9 * 3600000, i % 2 ? 'ST-04' : c.managerId);
    });

    L.notify(db, demo.id, 'account', 'notif.welcome', {}, T - 75 * DAY);
    L.notify(db, demo.id, 'payment', 'notif.depositDone', { amount: '25 000', asset: 'USDT' }, T - 74 * DAY);
    L.notify(db, demo.id, 'support', 'notif.ticketReply', { id: db.tickets[0].id }, T - 73 * DAY + 3600000);
    L.notify(db, demo.id, 'system', 'notif.demoInfo', {}, T - 3600000);
    db.notifications.forEach((n) => { if (n.at < T - DAY) n.read = true; });

    db.clients.forEach((c) => { const last = Math.max(c.createdAt, ...db.trades.filter((x) => x.clientId === c.id).map((x) => x.at)); c.lastActivityAt = last; c.updatedAt = last; });
    return db;
  }

  NX.seed = { build, DB_VERSION, tx };
})(window.NX);
