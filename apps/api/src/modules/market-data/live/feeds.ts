import { type TradableMarket } from '@nexora/contracts';
import { type Env } from '../../../config/env';
import { BinanceFeed } from './binance';
import { EiaFeed } from './eia';
import { type LiveFeed } from './live-feed';
import { MassiveIndicesFeed } from './massive';
import { TwelveDataFeed } from './twelve-data';

/**
 * Live reference feeds enabled by MARKET_LIVE_FEEDS, by market, in order of preference: the first feed that
 * supports an instrument serves it. An instrument no feed covers (e.g. agriculture, or a symbol a plan refuses)
 * uses the simulator.
 */
export function createFeeds(env: Env): Map<TradableMarket, LiveFeed[]> {
  const feeds = new Map<TradableMarket, LiveFeed[]>();
  const add = (market: TradableMarket, f: LiveFeed) => feeds.set(market, [...(feeds.get(market) ?? []), f]);
  if (env.MARKET_LIVE_FEEDS.includes('binance')) add('crypto', new BinanceFeed(env.BINANCE_BASE_URL));
  if (env.MARKET_LIVE_FEEDS.includes('twelvedata') && env.TWELVEDATA_API_KEY) {
    // one instance for all its markets: they share the plan's credit budget
    const td = new TwelveDataFeed(env.TWELVEDATA_BASE_URL, env.TWELVEDATA_API_KEY, {
      minuteLimit: env.TWELVEDATA_MINUTE_LIMIT,
      dailyLimit: env.TWELVEDATA_DAILY_LIMIT,
      focusRefreshMs: env.TWELVEDATA_FOCUS_REFRESH_SEC * 1000,
      markets: env.TWELVEDATA_MARKETS,
    });
    if (env.TWELVEDATA_MARKETS.includes('forex')) add('forex', td);
    if (env.TWELVEDATA_MARKETS.includes('stocks')) add('stocks', td);
    // precious metals only; energy is served by EIA, agriculture stays on the simulator
    if (env.TWELVEDATA_MARKETS.includes('metals')) add('commodities', td);
  }
  if (env.MARKET_LIVE_FEEDS.includes('massive') && env.MASSIVE_API_KEY) add('indices', new MassiveIndicesFeed(env.MASSIVE_BASE_URL, env.MASSIVE_API_KEY));
  if (env.MARKET_LIVE_FEEDS.includes('eia') && env.EIA_API_KEY) add('commodities', new EiaFeed(env.EIA_BASE_URL, env.EIA_API_KEY, env.MARKET_SEED));
  return feeds;
}
