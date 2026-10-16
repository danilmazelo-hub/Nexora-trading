/* NEXORA instrument catalogue (demo reference data).
   Prices are illustrative anchors for the simulation, NOT live market data.
   Contract: see docs/API_CONTRACTS.md → Instrument. */
(function (NX) {
  'use strict';

  // [symbol, name, sub-category, anchor price, daily volatility %, daily liquidity (USD, millions)]
  const CRYPTO = [
    ['BTC/USD', 'Bitcoin', 'l1', 83408.01, 2.8, 28000], ['ETH/USD', 'Ethereum', 'l1', 2508.42, 3.4, 14000],
    ['SOL/USD', 'Solana', 'l1', 106.84, 4.5, 3200], ['BNB/USD', 'BNB', 'l1', 741.47, 2.8, 1800],
    ['XRP/USD', 'XRP', 'l1', 1.3678, 4.0, 1600], ['ADA/USD', 'Cardano', 'l1', 0.2364, 4.2, 520],
    ['DOGE/USD', 'Dogecoin', 'meme', 0.08428, 5.5, 1100], ['AVAX/USD', 'Avalanche', 'l1', 10.268, 4.8, 480],
    ['DOT/USD', 'Polkadot', 'l1', 1.16, 4.3, 260], ['LINK/USD', 'Chainlink', 'defi', 12.902, 4.5, 420],
    ['TRX/USD', 'TRON', 'l1', 0.3277, 2.5, 380], ['LTC/USD', 'Litecoin', 'l1', 61.32, 3.8, 410],
    ['BCH/USD', 'Bitcoin Cash', 'l1', 273.8, 4.0, 330], ['ETC/USD', 'Ethereum Classic', 'l1', 8.11, 4.4, 210],
    ['XLM/USD', 'Stellar', 'l1', 0.191, 3.9, 120], ['NEAR/USD', 'NEAR Protocol', 'l1', 5.033, 5.0, 290],
    ['ICP/USD', 'Internet Computer', 'ai', 3.097, 5.0, 140], ['APT/USD', 'Aptos', 'l1', 0.8342, 5.2, 220],
    ['SUI/USD', 'Sui', 'l1', 1.0469, 6.0, 380], ['ATOM/USD', 'Cosmos', 'l1', 1.861, 4.4, 170],
    ['ALGO/USD', 'Algorand', 'l1', 0.1199, 4.6, 70], ['HBAR/USD', 'Hedera', 'l1', 0.08731, 4.6, 90],
    ['VET/USD', 'VeChain', 'l1', 0.007283, 4.6, 60], ['TIA/USD', 'Celestia', 'l1', 0.5642, 6.0, 150],
    ['SEI/USD', 'Sei', 'l1', 0.06376, 6.0, 120], ['TAO/USD', 'Bittensor', 'ai', 278.6, 6.0, 160],
    ['HYPE/USD', 'Hyperliquid', 'defi', 81.456, 6.5, 260], ['DASH/USD', 'Dash', 'l1', 49.96, 4.2, 60],
    ['UNI/USD', 'Uniswap', 'defi', 7.567, 5.0, 210], ['AAVE/USD', 'Aave', 'defi', 160.08, 5.0, 230],
    ['INJ/USD', 'Injective', 'defi', 8.069, 5.5, 140], ['ONDO/USD', 'Ondo', 'defi', 0.4648, 6.0, 130],
    ['ENA/USD', 'Ethena', 'defi', 0.2099, 6.5, 170], ['CRV/USD', 'Curve DAO', 'defi', 0.336, 5.5, 80],
    ['JUP/USD', 'Jupiter', 'defi', 0.3304, 6.0, 90], ['PENDLE/USD', 'Pendle', 'defi', 2.115, 6.0, 70],
    ['LDO/USD', 'Lido DAO', 'defi', 0.4287, 5.5, 90], ['ZRO/USD', 'LayerZero', 'ai', 2.009, 6.0, 80],
    ['ARB/USD', 'Arbitrum', 'l2', 0.1902, 5.5, 240], ['OP/USD', 'Optimism', 'l2', 0.1572, 5.5, 160],
    ['POL/USD', 'Polygon', 'l2', 0.10177, 5.0, 150], ['PEPE/USD', 'Pepe', 'meme', 0.0042, 7.0, 600],
    ['WIF/USD', 'dogwifhat', 'meme', 0.2076, 8.0, 310], ['TRUMP/USD', 'Official Trump', 'meme', 1.901, 8.0, 240],
    ['PUMP/USD', 'Pump.fun', 'meme', 0.004991, 8.0, 160], ['FET/USD', 'Artificial Superintelligence Alliance', 'ai', 0.2141, 6.0, 190],
    ['RENDER/USD', 'Render', 'ai', 2.033, 6.0, 170], ['FIL/USD', 'Filecoin', 'ai', 1.1511, 5.0, 150],
    ['WLD/USD', 'Worldcoin', 'ai', 0.513, 6.5, 180], ['ORDI/USD', 'ORDI', 'ai', 4.115, 7.0, 110]
  ];
  const STOCKS = [
    ['AAPL', 'Apple Inc.', 'tech', 178.32, 1.6, 12000], ['MSFT', 'Microsoft Corp.', 'tech', 425.31, 1.5, 9000],
    ['GOOGL', 'Alphabet Inc.', 'tech', 168.41, 1.8, 6000], ['AMZN', 'Amazon.com Inc.', 'consumer', 185.16, 2.0, 8000],
    ['NVDA', 'NVIDIA Corp.', 'tech', 132.82, 3.2, 30000], ['META', 'Meta Platforms', 'tech', 571.25, 2.3, 7000],
    ['TSLA', 'Tesla Inc.', 'consumer', 248.11, 3.5, 22000], ['BRK.B', 'Berkshire Hathaway', 'finance', 452.6, 1.0, 1500],
    ['UNH', 'UnitedHealth Group', 'health', 562.4, 1.5, 1800], ['JNJ', 'Johnson & Johnson', 'health', 158.3, 1.0, 1300],
    ['V', 'Visa Inc.', 'finance', 284.7, 1.2, 1600], ['WMT', 'Walmart Inc.', 'consumer', 80.12, 1.1, 1500],
    ['PG', 'Procter & Gamble', 'consumer', 168.9, 0.9, 1100], ['MA', 'Mastercard', 'finance', 498.6, 1.2, 1300],
    ['JPM', 'JPMorgan Chase', 'finance', 212.4, 1.4, 2200], ['GS', 'Goldman Sachs', 'finance', 498.1, 1.6, 1100],
    ['CVX', 'Chevron', 'energy', 152.7, 1.5, 1200], ['XOM', 'Exxon Mobil', 'energy', 118.6, 1.5, 1800],
    ['HD', 'Home Depot', 'consumer', 398.2, 1.3, 1200], ['DIS', 'Walt Disney', 'consumer', 94.35, 1.6, 1000],
    ['NFLX', 'Netflix', 'tech', 712.3, 2.3, 2400], ['ADBE', 'Adobe', 'tech', 512.8, 2.0, 1500],
    ['CSCO', 'Cisco Systems', 'tech', 52.84, 1.3, 1000], ['PLTR', 'Palantir', 'tech', 41.25, 3.8, 3500],
    ['TSM', 'TSMC', 'tech', 186.5, 2.5, 2600], ['MU', 'Micron Technology', 'tech', 104.6, 3.0, 2100],
    ['ASML', 'ASML Holding', 'tech', 842.1, 2.4, 1300], ['LMT', 'Lockheed Martin', 'industrial', 584.2, 1.2, 600],
    ['RTX', 'RTX Corp.', 'industrial', 122.4, 1.2, 700], ['BA', 'Boeing', 'industrial', 158.3, 2.1, 1300],
    ['GE', 'GE Aerospace', 'industrial', 182.6, 1.7, 900], ['HON', 'Honeywell', 'industrial', 208.4, 1.2, 700],
    ['COST', 'Costco', 'consumer', 892.5, 1.2, 1100], ['AMD', 'AMD', 'tech', 158.7, 3.0, 6000],
    ['INTC', 'Intel', 'tech', 22.84, 2.8, 1800], ['AVGO', 'Broadcom', 'tech', 172.3, 2.8, 5000],
    ['AMGN', 'Amgen', 'health', 324.6, 1.3, 700], ['AXP', 'American Express', 'finance', 268.2, 1.5, 700],
    ['CAT', 'Caterpillar', 'industrial', 384.5, 1.6, 900], ['CRM', 'Salesforce', 'tech', 284.2, 2.0, 1400],
    ['IBM', 'IBM', 'tech', 228.4, 1.4, 900], ['KO', 'Coca-Cola', 'consumer', 69.84, 0.9, 900],
    ['MCD', "McDonald's", 'consumer', 298.6, 1.0, 800], ['MMM', '3M', 'industrial', 132.4, 1.4, 500],
    ['MRK', 'Merck & Co.', 'health', 108.2, 1.3, 1100], ['NKE', 'Nike', 'consumer', 82.45, 1.8, 900],
    ['SHW', 'Sherwin-Williams', 'industrial', 372.6, 1.4, 400], ['TRV', 'Travelers', 'finance', 242.8, 1.2, 300],
    ['VZ', 'Verizon', 'consumer', 43.12, 1.0, 900]
  ];
  const INDICES = [
    ['SPX', 'S&P 500', 'americas', 5805.45, 1.0, 50000], ['NDX', 'NASDAQ 100', 'americas', 20321.65, 1.3, 40000],
    ['DJI', 'Dow Jones 30', 'americas', 42120.27, 0.9, 20000], ['IXIC', 'NASDAQ Composite', 'americas', 18342.9, 1.3, 15000],
    ['RUT', 'Russell 2000', 'americas', 2214.6, 1.5, 8000], ['VIX', 'CBOE Volatility Index', 'americas', 20.42, 6.0, 2000],
    ['FCHI', 'CAC 40', 'europe', 7684.22, 1.1, 6000], ['GDAXI', 'DAX 40', 'europe', 18495.66, 1.1, 9000],
    ['FTSE', 'FTSE 100', 'europe', 8241.31, 0.9, 7000], ['IBEX', 'IBEX 35', 'europe', 11182.14, 1.1, 3000],
    ['FTSEMIB', 'FTSE MIB', 'europe', 34560.11, 1.2, 3000], ['AEX', 'AEX 25', 'europe', 901.82, 1.0, 2000],
    ['N225', 'Nikkei 225', 'asia', 38511.7, 1.4, 12000], ['HSI', 'Hang Seng', 'asia', 17861.44, 1.7, 9000],
    ['SSEC', 'Shanghai Composite', 'asia', 3142.18, 1.3, 9000], ['BSESN', 'BSE Sensex', 'asia', 81945.62, 0.9, 4000],
    ['TWII', 'Taiwan Weighted', 'asia', 23119.53, 1.3, 4000], ['KS11', 'KOSPI', 'asia', 2678.91, 1.2, 4000]
  ];
  // Forex prices are derived from USD rates (units of currency per 1 USD).
  const USD_RATES = { USD: 1, EUR: 1 / 1.0891, GBP: 1 / 1.2736, AUD: 1 / 0.6751, NZD: 1 / 0.6124, JPY: 149.32, CHF: 0.8721, CAD: 1.3712,
    SEK: 10.412, NOK: 10.684, DKK: 6.851, PLN: 3.942, CZK: 23.18, HUF: 365.4, RON: 4.571, MXN: 19.62, ZAR: 17.64, BRL: 5.584,
    CLP: 938.4, COP: 4185, TRY: 34.28, ILS: 3.742, INR: 83.92, SGD: 1.3098, HKD: 7.772, THB: 33.42, CNH: 7.112, KRW: 1368.5 };
  const CCY_NAMES = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', AUD: 'Australian Dollar', NZD: 'New Zealand Dollar', JPY: 'Japanese Yen',
    CHF: 'Swiss Franc', CAD: 'Canadian Dollar', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', PLN: 'Polish Zloty',
    CZK: 'Czech Koruna', HUF: 'Hungarian Forint', RON: 'Romanian Leu', MXN: 'Mexican Peso', ZAR: 'South African Rand', BRL: 'Brazilian Real',
    CLP: 'Chilean Peso', COP: 'Colombian Peso', TRY: 'Turkish Lira', ILS: 'Israeli Shekel', INR: 'Indian Rupee', SGD: 'Singapore Dollar',
    HKD: 'Hong Kong Dollar', THB: 'Thai Baht', CNH: 'Offshore Yuan', KRW: 'South Korean Won' };
  const FX_MAJORS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'];
  const FX_CROSSES = ['EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'EUR/AUD', 'EUR/NZD', 'EUR/CAD', 'GBP/JPY', 'GBP/CHF', 'GBP/AUD', 'GBP/NZD', 'GBP/CAD',
    'AUD/JPY', 'NZD/JPY', 'CAD/JPY', 'CHF/JPY', 'AUD/NZD', 'AUD/CAD', 'NZD/CAD', 'CAD/CHF', 'AUD/CHF', 'NZD/CHF'];
  const FX_EXOTICS = ['USD/SEK', 'USD/NOK', 'USD/DKK', 'USD/PLN', 'USD/CZK', 'USD/HUF', 'USD/RON', 'USD/MXN', 'USD/ZAR', 'USD/BRL', 'USD/CLP',
    'USD/COP', 'USD/TRY', 'USD/ILS', 'USD/INR', 'USD/SGD', 'USD/HKD', 'USD/THB', 'USD/CNH', 'USD/KRW', 'EUR/SEK', 'EUR/NOK', 'EUR/DKK',
    'EUR/PLN', 'EUR/HUF', 'EUR/CZK', 'EUR/TRY', 'EUR/SGD', 'EUR/HKD', 'EUR/ZAR', 'GBP/SEK', 'GBP/NOK', 'GBP/DKK', 'GBP/SGD', 'AUD/SGD'];
  // [symbol, name, sub, price, vol, liquidity, unit, iconKey]
  const COMMODITIES = [
    ['XAU/USD', 'Gold', 'metals', 2342.8, 1.1, 15000, 'oz'], ['XAG/USD', 'Silver', 'metals', 32.81, 1.9, 3000, 'oz'],
    ['XPT/USD', 'Platinum', 'metals', 984.2, 1.7, 600, 'oz', 'PL'], ['XPD/USD', 'Palladium', 'metals', 1012.5, 2.2, 300, 'oz', 'PA'],
    ['HG', 'Copper', 'metals', 4.312, 1.6, 1500, 'lb'],
    ['USOIL', 'WTI Crude Oil', 'energy', 76.45, 2.2, 9000, 'bbl'], ['BRENT', 'Brent Crude Oil', 'energy', 82.41, 2.0, 7000, 'bbl'],
    ['NATGAS', 'Natural Gas', 'energy', 3.16, 3.8, 3000, 'MMBtu'], ['RB', 'Gasoline RBOB', 'energy', 2.184, 2.3, 900, 'gal'],
    ['HO', 'Heating Oil', 'energy', 2.412, 2.2, 800, 'gal'], ['EH', 'Ethanol', 'energy', 1.684, 1.8, 100, 'gal'],
    ['CC', 'Cocoa', 'agri', 7812, 3.0, 300, 't'], ['KC', 'Coffee Arabica', 'agri', 2.384, 2.4, 400, 'lb'],
    ['SB', 'Sugar No.11', 'agri', 0.2112, 2.0, 400, 'lb'], ['CT', 'Cotton', 'agri', 0.7134, 1.6, 250, 'lb'],
    ['OJ', 'Orange Juice', 'agri', 4.125, 2.8, 60, 'lb'], ['LBS', 'Lumber', 'agri', 548.5, 2.2, 50, 'mbf'],
    ['LE', 'Live Cattle', 'agri', 1.8642, 1.0, 300, 'lb'], ['ZS', 'Soybeans', 'agri', 10.24, 1.4, 900, 'bu'],
    ['ZM', 'Soybean Meal', 'agri', 328.4, 1.6, 300, 'st'], ['ZL', 'Soybean Oil', 'agri', 0.4215, 1.8, 300, 'lb'],
    ['ZC', 'Corn', 'agri', 4.122, 1.5, 1200, 'bu'], ['ZW', 'Wheat', 'agri', 5.684, 1.9, 800, 'bu'],
    ['ZR', 'Rough Rice', 'agri', 15.12, 1.3, 40, 'cwt']
  ];

  const MARKETS = ['crypto', 'stocks', 'indices', 'forex', 'commodities'];
  const SUBS = {
    crypto: ['l1', 'l2', 'defi', 'meme', 'ai'],
    stocks: ['tech', 'finance', 'health', 'consumer', 'energy', 'industrial'],
    indices: ['americas', 'europe', 'asia'],
    forex: ['majors', 'crosses', 'exotics'],
    commodities: ['metals', 'energy', 'agri']
  };
  // Spread (basis points, full bid-ask) and quantity step defaults per market.
  const MARKET_DEFAULTS = {
    crypto: { spreadBps: 6, unit: '' }, stocks: { spreadBps: 3, unit: 'sh' }, indices: { spreadBps: 2, unit: 'pt' },
    forex: { spreadBps: 1.2, unit: '' }, commodities: { spreadBps: 5, unit: '' }
  };

  function priceDecimals(market, price) {
    if (market === 'forex') return price < 20 ? 5 : price < 500 ? 3 : 2;
    if (price >= 1000) return 2;
    if (price >= 10) return 2;
    if (price >= 1) return 4;
    if (price >= 0.01) return 5;
    if (price >= 0.0001) return 6;
    return 8;
  }
  function qtyStep(market, price) {
    if (market === 'forex') return 1;
    if (market === 'stocks') return 0.001;
    if (market === 'indices') return 0.01;
    if (price >= 10000) return 0.00001;
    if (price >= 100) return 0.0001;
    if (price >= 1) return 0.01;
    if (price >= 0.01) return 1;
    return 1000;
  }

  const list = [];
  function add(market, sub, row, extra) {
    const [symbol, name, , price, vol, liq] = row;
    const parts = symbol.split('/');
    const quote = market === 'forex' ? parts[1] : 'USD';
    const base = market === 'forex' || market === 'crypto' || (market === 'commodities' && parts.length === 2) ? parts[0] : symbol;
    list.push(Object.assign({
      id: symbol, symbol, name, market, sub, base, quote,
      basePrice: price, volatility: vol / 100, liquidityUsd: liq * 1e6,
      decimals: priceDecimals(market, price), qtyStep: qtyStep(market, price),
      spreadBps: MARKET_DEFAULTS[market].spreadBps, unit: MARKET_DEFAULTS[market].unit, enabled: true
    }, extra || {}));
  }
  CRYPTO.forEach((r) => add('crypto', r[2], r));
  STOCKS.forEach((r) => add('stocks', r[2], r));
  INDICES.forEach((r) => add('indices', r[2], r));
  const fxPrice = (pair) => { const [b, q] = pair.split('/'); return USD_RATES[q] / USD_RATES[b]; };
  const fxVol = (pair) => /TRY|ZAR|BRL|MXN|COP|CLP|HUF/.test(pair) ? 0.9 : /SEK|NOK|PLN|CZK|RON|ILS|INR|KRW|THB/.test(pair) ? 0.65 : 0.5;
  const fxName = (pair) => { const [b, q] = pair.split('/'); return CCY_NAMES[b] + ' / ' + CCY_NAMES[q]; };
  [['majors', FX_MAJORS], ['crosses', FX_CROSSES], ['exotics', FX_EXOTICS]].forEach(([sub, pairs]) => pairs.forEach((p) =>
    add('forex', sub, [p, fxName(p), sub, fxPrice(p), fxVol(p), sub === 'majors' ? 60000 : sub === 'crosses' ? 9000 : 2500])));
  COMMODITIES.forEach((r) => add('commodities', r[2], r, { unit: r[6], iconKey: r[7] || null }));

  const byId = {};
  list.forEach((i) => { byId[i.id] = i; });

  NX.catalog = {
    MARKETS, SUBS, CCY_NAMES,
    all: () => list,
    get: (id) => byId[id] || null,
    byMarket: (m) => list.filter((i) => i.market === m),
    // Converts an amount in currency `ccy` to USD using live simulated FX quotes.
    usdPairFor(ccy) { if (ccy === 'USD') return null; return byId[ccy + '/USD'] ? { id: ccy + '/USD', invert: false } : byId['USD/' + ccy] ? { id: 'USD/' + ccy, invert: true } : null; }
  };
})(window.NX);
