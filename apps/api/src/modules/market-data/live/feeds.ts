import { type TradableMarket } from '@nexora/contracts';
import { type Env } from '../../../config/env';
import { BinanceFeed } from './binance';
import { type LiveFeed } from './live-feed';
import { TwelveDataFeed } from './twelve-data';

/** Live reference feeds enabled by MARKET_LIVE_FEEDS, one per market. Markets without a feed use the simulator. */
export function createFeeds(env: Env): Map<TradableMarket, LiveFeed> {
  const feeds = new Map<TradableMarket, LiveFeed>();
  if (env.MARKET_LIVE_FEEDS.includes('binance')) feeds.set('crypto', new BinanceFeed(env.BINANCE_BASE_URL));
  if (env.MARKET_LIVE_FEEDS.includes('twelvedata') && env.TWELVEDATA_API_KEY) {
    feeds.set(
      'forex',
      new TwelveDataFeed(env.TWELVEDATA_BASE_URL, env.TWELVEDATA_API_KEY, {
        minuteLimit: env.TWELVEDATA_MINUTE_LIMIT,
        dailyLimit: env.TWELVEDATA_DAILY_LIMIT,
        focusRefreshMs: env.TWELVEDATA_FOCUS_REFRESH_SEC * 1000,
      }),
    );
  }
  return feeds;
}
