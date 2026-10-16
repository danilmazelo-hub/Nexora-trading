# Third-party notices

## TradingView Lightweight Charts™
Copyright (c) 2023 TradingView, Inc. — https://www.tradingview.com/
Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
Used for candlestick charts in `apps/web` (see docs/decisions/0004-chart-library.md).

## Other runtime dependencies
React, React Router, TanStack Query (MIT); NestJS, Prisma Client (MIT / Apache-2.0); zod, decimal.js (MIT);
PostgreSQL (PostgreSQL License). Full license texts ship with each package in `node_modules`.

## Instrument icons (ADR 0006)
Icons and flags in `apps/web/public/instruments/` are carried over from the NEXORA prototype
(`legacy/nexora-demo/assets`, full license texts in `legacy/nexora-demo/THIRD-PARTY-NOTICES.txt`):
- Microsoft Fluent Emoji coin artwork — Copyright (c) Microsoft Corporation, MIT License.
- Cryptocurrency Icons (spothq/cryptocurrency-icons, ErikThiart/cryptocurrency-icons) — CC0 1.0 Universal.
- Simple Icons (simple-icons/simple-icons) — CC0 1.0 Universal; stock images from nvstly/icons and financialmodelingprep.
- flag-icons by lipis — MIT License, Copyright (c) 2013-present Panayiotis Lipiridis.

Company and token logos remain trademarks of their respective owners; their use identifies the instrument only and
implies no affiliation or endorsement.

## Market data (optional, ADR 0005)
When enabled in `apps/api/.env`: Binance Spot public market data (crypto), Twelve Data (forex, US stocks, gold),
Massive (US indices, end of day), FRED® (Federal Reserve Bank of St. Louis; index series remain the property of
their publishers, e.g. S&P Dow Jones Indices) and the U.S. Energy Information Administration open data (energy spot prices, public
domain; source: U.S. EIA) are used as
reference prices only, under each provider's terms of use; check those terms before any public display. No provider
logos are shown. Without these feeds all prices are simulated.

Instrument names and tickers in the demo catalogue are used only to identify markets.
The legacy prototype keeps its own notices in `legacy/nexora-demo/THIRD-PARTY-NOTICES.txt`.
