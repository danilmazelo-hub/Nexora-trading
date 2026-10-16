import { Controller, Get } from '@nestjs/common';
import { type Capabilities } from '@nexora/contracts';
import { MarketDataService } from '../market-data/market-data.service';

/**
 * What the demo offers: which sections are usable now, which are still in development, which are simulated.
 * The web shell reads this to label sections honestly (an unfinished screen is never shown as a feature).
 */
export const CAPABILITIES: Capabilities = {
  mode: 'demo',
  realMoney: false,
  priceSource: 'simulator',
  sections: [
    { id: 'demo', path: '/demo', status: 'available', simulated: true, tasks: ['D03', 'D06'] },
    { id: 'markets', path: '/markets', status: 'available', simulated: true, tasks: ['D12'] },
    { id: 'markets.crypto', path: '/markets/crypto', status: 'available', simulated: true, tasks: ['D12', 'D13', 'D20'] },
    { id: 'markets.stocks', path: '/markets/stocks', status: 'available', simulated: true, tasks: ['D12', 'D13', 'D21'] },
    { id: 'markets.indices', path: '/markets/indices', status: 'available', simulated: true, tasks: ['D12', 'D13', 'D22'] },
    { id: 'markets.forex', path: '/markets/forex', status: 'available', simulated: true, tasks: ['D12', 'D13', 'D23'] },
    { id: 'markets.commodities', path: '/markets/commodities', status: 'available', simulated: true, tasks: ['D12', 'D13', 'D24'] },
    { id: 'finance.account', path: '/finance/account', status: 'in_development', simulated: true, tasks: ['D25', 'D27'] },
    { id: 'finance.pnl', path: '/finance/pnl', status: 'in_development', simulated: true, tasks: ['D26'] },
    { id: 'finance.verification', path: '/finance/verification', status: 'in_development', simulated: true, tasks: ['D36'] },
    { id: 'subscription', path: '/subscription', status: 'in_development', simulated: true, tasks: ['D32'] },
    { id: 'activity', path: '/activity', status: 'in_development', simulated: true, tasks: ['D19'] },
    { id: 'ventures', path: '/ventures', status: 'in_development', simulated: true, tasks: ['D35'] },
    { id: 'ai', path: '/ai', status: 'in_development', simulated: true, tasks: ['D33', 'D34'] },
    { id: 'settings.profile', path: '/settings/profile', status: 'in_development', simulated: false, tasks: ['D37'] },
    { id: 'settings.security', path: '/settings/security', status: 'in_development', simulated: true, tasks: ['D38'] },
    { id: 'settings.notifications', path: '/settings/notifications', status: 'in_development', simulated: false, tasks: ['D40'] },
    { id: 'settings.language', path: '/settings/language', status: 'in_development', simulated: false, tasks: ['D39'] },
    { id: 'trading', path: '/markets', status: 'in_development', simulated: true, tasks: ['D14', 'D15', 'D16', 'D17', 'D18'] },
    { id: 'payments', path: '/finance/account', status: 'in_development', simulated: true, tasks: ['D28', 'D29', 'D30', 'D31'] },
    { id: 'metals', path: '/markets', status: 'coming_soon', simulated: false, tasks: [] },
    { id: 'bonds', path: '/markets', status: 'coming_soon', simulated: false, tasks: [] },
    { id: 'etfs', path: '/markets', status: 'coming_soon', simulated: false, tasks: [] },
    { id: 'options', path: '/markets', status: 'coming_soon', simulated: false, tasks: [] },
  ],
};

@Controller('capabilities')
export class CapabilitiesController {
  constructor(private readonly market: MarketDataService) {}

  @Get()
  get(): Capabilities {
    // live reference feeds (ADR 0005) are named in priceSource; trading and money stay simulated
    return { ...CAPABILITIES, priceSource: this.market.priceSource() };
  }
}
