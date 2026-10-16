/**
 * NEXORA — data contracts shared by the frontend and the future backend.
 * The demo implementation (js/data/*) produces exactly these shapes.
 * All timestamps are Unix epoch milliseconds (UTC). Money is in USD unless stated otherwise.
 */

export type ID = string;
export type Timestamp = number;
export type Market = 'crypto' | 'stocks' | 'indices' | 'forex' | 'commodities';
export type Lang = 'ru' | 'uk' | 'en';
/** Seeded demo text may be multilingual; user-entered text is a plain string. */
export type Text = string | { ru: string; uk: string; en: string };

/* ---------------- Auth / roles ---------------- */
export type RoleId = 'client' | 'manager' | 'support' | 'admin' | string;
export type Permission =
  | 'terminal.trade' | 'cabinet.view' | 'market.view'
  | 'crm.view' | 'crm.clients.create' | 'crm.clients.edit' | 'crm.assign' | 'crm.notes' | 'crm.tasks' | 'crm.tickets'
  | 'payments.approve' | 'admin.staff' | 'admin.roles' | 'admin.instruments' | 'admin.fees' | 'admin.settings' | 'demo.reset';

export interface Role { id: RoleId; name: Text; system: boolean; permissions: Permission[]; }
export interface Session { role: RoleId; clientId?: ID; staffId?: ID; }   // server issues a token; never trust the client
export interface Staff { id: ID; name: string; email: string; phone?: string; role: RoleId; active: boolean; }

/* ---------------- Market data ---------------- */
export interface Instrument {
  id: ID;                 // e.g. "BTC/USD", "AAPL", "EUR/USD", "XAU/USD"
  symbol: string; name: string; market: Market; sub: string;   // sub-category (l1, tech, majors, metals…)
  base: string; quote: string;                                 // quote currency of the price
  decimals: number;       // price precision
  qtyStep: number;        // minimal quantity increment
  unit: string;           // oz, bbl, sh, pt…
  spreadBps: number;      // full bid-ask spread in basis points
  feeRate?: number;       // per-instrument fee override (fraction)
  enabled: boolean;
}
export interface Quote {
  id: ID; t: Timestamp;
  mid: number; bid: number; ask: number;
  prevClose: number;      // price 24h ago
  change: number; changePct: number;
  high24?: number; low24?: number; volume24?: number; volumeUsd24?: number;
}
export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
/** OHLCV candle; t = bucket start. The last candle may be still forming. */
export interface Candle { t: Timestamp; o: number; h: number; l: number; c: number; v: number; }
export type HeatmapPeriod = '1d' | '1w' | '1m' | '3m' | '1y';
export interface PeriodChange { now: number; then: number; pct: number; }

/* ---------------- Clients & accounts ---------------- */
export type Stage = 'new' | 'contacted' | 'qualified' | 'registered' | 'funded' | 'active' | 'lost';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export interface Client {
  id: ID;                 // single client id used by cabinet and CRM, e.g. "CL-1001"
  name: string; email: string; phone: string; country: string; language: Lang;
  stage: Stage; managerId: ID | null; source: string; tags: string[]; kyc: KycStatus;
  accountId: ID | null;
  createdAt: Timestamp; updatedAt: Timestamp; lastActivityAt: Timestamp;
}
/** What the client cabinet receives about itself — no CRM-internal fields. */
export interface ClientSelf {
  id: ID; name: string; email: string; phone: string; country: string; language: Lang; kyc: KycStatus;
  accountId: ID | null; createdAt: Timestamp;
  manager: { name: string; email: string; phone: string } | null;
}
export interface Account { id: ID; clientId: ID; currency: 'USD'; type: 'demo' | 'live'; cash: number; status: 'active' | 'blocked'; createdAt: Timestamp; updatedAt: Timestamp; }
export interface Position {
  id: ID; accountId: ID; clientId: ID; instrumentId: ID;
  qty: number;            // base units / shares / contracts
  avgPrice: number;       // in instrument quote currency, excl. fees
  costUsd: number;        // cost basis in USD incl. buy fees
  openedAt: Timestamp; updatedAt?: Timestamp;
}
export interface ValuedPosition extends Position {
  symbol: string; name: string; market: Market; quoteCcy: string;
  price: number;          // bid used for valuation
  valueUsd: number; pnlUsd: number; pnlPct: number;
}
export interface AccountSummary {
  account: Account;
  cash: number; reservedCash: number; available: number; pendingWithdrawalsUsd: number;
  positionsValue: number; equity: number; unrealizedPnl: number; realizedPnl: number; feesPaid: number;
  positions: ValuedPosition[];
}

/* ---------------- Orders & trades ---------------- */
export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'new' | 'open' | 'filled' | 'cancelled' | 'rejected';
export interface OrderRequest { instrumentId: ID; side: Side; type: OrderType; qty: number; limitPrice?: number | null; }
export interface Order {
  id: ID; accountId: ID; clientId: ID; instrumentId: ID; side: Side; type: OrderType;
  qty: number; limitPrice: number | null; status: OrderStatus;
  reservedUsd: number;    // cash locked by an open buy limit order
  fillPrice?: number; reason?: string;
  createdAt: Timestamp; updatedAt: Timestamp; filledAt?: Timestamp;
}
export interface Trade {
  id: ID; orderId: ID; accountId: ID; clientId: ID; instrumentId: ID; side: Side; type: OrderType;
  qty: number; price: number; quoteCcy: string; fxRate: number;   // quote → USD
  notionalUsd: number; fee: number; realizedPnl: number | null; at: Timestamp;
}
export interface OrderPreview {
  ok: boolean; errors: string[];          // error codes, see docs/API_CONTRACTS.md
  instrumentId: ID; side: Side; type: OrderType; qty: number; price: number; quote: Quote; fxRate: number;
  notionalUsd: number; fee: number; totalUsd: number; available: number; availableAfter: number;
  positionQty: number; availableQty: number; estPnl: number | null;
}

/* ---------------- Payments (crypto deposit / withdrawal) ---------------- */
export type PaymentType = 'deposit' | 'withdrawal' | 'demo_credit' | 'adjustment';
export type PaymentStatus = 'awaiting' | 'confirming' | 'review' | 'processing' | 'completed' | 'cancelled' | 'rejected' | 'expired';
export interface Payment {
  id: ID; clientId: ID; accountId: ID; type: PaymentType;
  asset: 'USDT' | 'USDC' | 'BTC' | 'ETH' | 'USD'; network: 'TRC20' | 'ERC20' | 'BTC' | '—';
  amount: number; amountUsd: number; fee: number; holdUsd?: number;
  address?: string;       // withdrawal destination, MASKED (full address never stored in the demo)
  status: PaymentStatus; reason?: string; ref: string;
  history: { status: PaymentStatus; at: Timestamp; by?: ID }[];
  createdAt: Timestamp; completedAt?: Timestamp;
}

/* ---------------- CRM ---------------- */
export interface Note { id: ID; clientId: ID; staffId: ID; text: Text; at: Timestamp; pinned: boolean; }  // internal only
export type TaskType = 'call' | 'email' | 'meeting' | 'todo';
export interface Task {
  id: ID; clientId: ID | null; title: Text; type: TaskType; priority: 'low' | 'normal' | 'high';
  dueAt: Timestamp; remindAt: Timestamp | null; reminded: boolean;
  assigneeId: ID; status: 'open' | 'done'; createdAt: Timestamp; createdBy: ID;
}
export interface Interaction {
  id: ID; clientId: ID; type: 'call' | 'email' | 'meeting' | 'chat' | 'system';
  text: Text; key: string | null; vars: Record<string, unknown> | null;  // system events use an i18n key + vars
  staffId: ID | null; at: Timestamp;
}
export interface TicketMessage { id: ID; author: 'client' | 'staff'; staffId?: ID; text: Text; at: Timestamp; }
export interface Ticket {
  id: ID; clientId: ID; subject: Text; category: 'trading' | 'payments' | 'kyc' | 'technical' | 'other';
  status: 'open' | 'in_progress' | 'resolved' | 'closed'; priority: 'low' | 'normal' | 'high';
  assigneeId: ID | null; messages: TicketMessage[]; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface Notification { id: ID; clientId: ID; kind: 'trade' | 'payment' | 'support' | 'account' | 'system'; key: string; vars: Record<string, unknown>; at: Timestamp; read: boolean; }

export interface ClientQuery { search?: string; stage?: Stage | 'all' | 'leads' | 'clients'; managerId?: ID | 'all' | 'none'; kyc?: KycStatus | 'all'; sort?: string; dir?: 'asc' | 'desc'; page?: number; pageSize?: number; }
export interface Page<T> { items: T[]; total: number; page: number; pages: number; pageSize: number; }

/* ---------------- Settings ---------------- */
export interface FeeRule { rate: number; min: number; }   // rate is a fraction (0.001 = 0.1 %), min in USD
export interface PlatformSettings {
  platformName: string; supportEmail: string; startBalance: number;
  minOrderUsd: number; minDepositUsd: number; minWithdrawUsd: number;
  fees: Record<Market, FeeRule>;
  withdrawFees: Record<string, number>;                  // "USDT:TRC20" → fee in asset units
  markets: Record<Market, boolean>;
  instruments: Record<ID, { enabled?: boolean; spreadBps?: number; feeRate?: number }>;
}

export interface ApiError { code: string; vars?: Record<string, unknown>; }
