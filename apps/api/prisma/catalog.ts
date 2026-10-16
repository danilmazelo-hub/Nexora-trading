// Demo instrument catalogue (fictional anchor prices, NOT market data). Source rows: catalog.data.json
// (exported once from the legacy NEXORA demo). Mapped here to the Instrument entity of D04.
import Decimal from 'decimal.js';
import rows from './catalog.data.json';

type Market = 'crypto' | 'stocks' | 'indices' | 'forex' | 'commodities';
interface Row {
  symbol: string;
  name: string;
  market: Market;
  sub: string;
  base: string;
  quote: string;
  refPrice: number;
  dailyVolatility: number;
  liquidityUsd: number;
  decimals: number;
  qtyStep: number;
  unit: string | null;
}

export interface CatalogInstrument {
  id: string;
  market: Market;
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: string;
  quantityStep: string;
  contractMultiplier: string;
  maxLeverage: number;
  categories: string[];
  unit: string | null;
  status: 'ACTIVE' | 'UNAVAILABLE';
  source: string;
  refPrice: string;
  dailyVolatility: string;
  liquidityUsd: string;
  sortOrder: number;
}

const MAX_LEVERAGE: Record<Market, number> = { crypto: 10, stocks: 5, indices: 20, forex: 30, commodities: 10 };
const SOFTS = new Set(['CC', 'KC', 'SB', 'CT', 'OJ']);
const LIVESTOCK = new Set(['LE']);
/** Instruments deliberately without a price feed in the demo (QA-11 / A13: shown as unavailable, never as 0). */
const NO_FEED = new Set(['LBS']);

function categoryOf(r: Row): string {
  if (r.market !== 'commodities' || r.sub !== 'agri') return r.sub;
  if (LIVESTOCK.has(r.symbol)) return 'livestock';
  if (SOFTS.has(r.symbol)) return 'softs';
  return 'agriculture';
}

/** URL-safe internal id: "BTC/USD" → "BTC-USD", "BRK.B" stays. */
export const instrumentIdOf = (symbol: string) => symbol.replace('/', '-');

export const CATALOG: CatalogInstrument[] = (rows as Row[]).map((r, i) => ({
  id: instrumentIdOf(r.symbol),
  market: r.market,
  symbol: r.symbol,
  name: r.name,
  baseAsset: r.base,
  quoteAsset: r.quote,
  tickSize: new Decimal(10).pow(-r.decimals).toFixed(),
  quantityStep: new Decimal(r.qtyStep).toFixed(),
  contractMultiplier: '1',
  maxLeverage: MAX_LEVERAGE[r.market],
  categories: [categoryOf(r)],
  unit: r.unit,
  status: NO_FEED.has(r.symbol) ? 'UNAVAILABLE' : 'ACTIVE',
  source: 'simulator',
  refPrice: new Decimal(r.refPrice).toSignificantDigits(12).toFixed(),
  dailyVolatility: new Decimal(r.dailyVolatility).toDecimalPlaces(6).toFixed(),
  liquidityUsd: new Decimal(r.liquidityUsd).toFixed(0),
  sortOrder: i,
}));
