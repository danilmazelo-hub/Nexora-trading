import { type TradableMarket } from '@nexora/contracts';
import { MARKET_LABEL } from '../../modules/instruments/labels';
import { InDevelopment } from '../InDevelopment';

export function MarketPage({ market }: { market: TradableMarket }) {
  return <InDevelopment title={MARKET_LABEL[market] ?? market} tasks={['D12', 'D13']} planned={['Выбор инструмента', 'Котировка', 'Свечной график']} />;
}
