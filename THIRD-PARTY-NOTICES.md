# Third-party notices

## TradingView Lightweight Charts™
Copyright (c) 2023 TradingView, Inc. — https://www.tradingview.com/
Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
Used for candlestick charts in `apps/web` (see docs/decisions/0004-chart-library.md).

## Other runtime dependencies
React, React Router, TanStack Query (MIT); NestJS, Prisma Client (MIT / Apache-2.0); zod, decimal.js (MIT);
PostgreSQL (PostgreSQL License). Full license texts ship with each package in `node_modules`.

## Market data (optional, ADR 0005)
When enabled in `apps/api/.env`: Binance Spot public market data (crypto) and Twelve Data (forex) are used as
reference prices only, under each provider's terms of use; check those terms before any public display. No provider
logos are shown. Without these feeds all prices are simulated.

Instrument names and tickers in the demo catalogue are used only to identify markets.
The legacy prototype keeps its own notices in `legacy/nexora-demo/THIRD-PARTY-NOTICES.txt`.
