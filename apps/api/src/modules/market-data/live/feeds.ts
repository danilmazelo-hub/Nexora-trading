import { type TradableMarket } from '@nexora/contracts';
import { type Env } from '../../../config/env';
import { BinanceFeed } from './binance';
import { type LiveFeed } from './live-feed';
import { TwelveDataFeed } from './twelve-data';

/**
 * Live reference feeds enabled by MARKET_LIVE_FEEDS, by market. An instrument the feed does not cover (e.g. oil on
 * the commodities market, or a symbol the plan refuses) uses the simulator.
 */
export function createFeeds(env: Env): Map<TradableMarket, LiveFeed> {
  const feeds = new Map<TradableMarket, LiveFeed>();
  if (env.MARKET_LIVE_FEEDS.includes('binance')) feeds.set('crypto', new BinanceFeed(env.BINANCE_BASE_URL));
  if (env.MARKET_LIVE_FEEDS.includes('twelvedata') && env.TWELVEDATA_API_KEY) {
    // one instance for all its markets: they share the plan's credit budget
    const td = new TwelveDataFeed(env.TWELVEDATA_BASE_URL, env.TWELVEDATA_API_KEY, {
      minuteLimit: env.TWELVEDATA_MINUTE_LIMIT,
      dailyLimit: env.TWELVEDATA_DAILY_LIMIT,
      focusRefreshMs: env.TWELVEDATA_FOCUS_REFRESH_SEC * 1000,
      markets: env.TWELVEDATA_MARKETS,
    });
    if (env.TWELVEDATA_MARKETS.includes('forex')) feeds.set('forex', td);
    if (env.TWELVEDATA_MARKETS.includes('stocks')) feeds.set('stocks', td);
    // only XAU/XAG/XPT/XPD; other commodities (energy, agriculture) stay on the simulator
    if (env.TWELVEDATA_MARKETS.includes('metals')) feeds.set('commodities', td);
  }
  return feeds;
}
