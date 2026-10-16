# Прогресс задач

Статусы: **Done (agent)** — реализовано и проверено агентом, ждёт ручной проверки разработчика по
[карте](handoff/DEVELOPER-ROADMAP-RU.md); **In progress**; **Not started**. Доказательства — [QA-results.md](QA-results.md).

| ID | Задача | Статус | Commit | Примечания |
|---|---|---|---|---|
| D00 | Объём, правила, устройство проекта | Done (agent) | см. git log `D00–D02` | CLAUDE.md, apps/*/CLAUDE.md, docs/* , ADR 0001–0002 |
| D01 | Каркас репозитория и команды | Done (agent) | `D00–D02` | pnpm workspaces, Nest 11, React 19/Vite 7, lint/typecheck/test/build |
| D02 | Локальная БД и диагностика | Done (agent) | `D00–D02` | embedded PostgreSQL 18 + compose, /health/live|ready, экран «API недоступен» |
| D03 | Демосессии, профиль, изоляция | Done (agent) | `D03–D05` | cookie-сессия (sha-256 токена), профиль, счёт, /demo, SessionGate |
| D04 | Справочник инструментов | Done (agent) | `D03–D05` | 204 инструмента, CHECK-ограничения, /markets, /instruments, AssetPicker, InstrumentSpecs |
| D05 | Журнал виртуальных денег | Done (agent) | `D03–D05` | LedgerAccount/Transaction/Entry, триггеры БД, идемпотентность, остаток, сторно, Money/AccountBalance |
| D06 | Тестовые данные и reset | Done (agent) | `D06–D08` | MarketSettings (seed/clock), сценарии сессии, reset с подтверждением, панель сценариев, сброс кеша |
| D07 | Навигационная карта | Done (agent) | `D06–D08` | 20 маршрутов карты, sidebar/bottom nav/topbar, 404, /capabilities, статус «в разработке» |
| D08 | Базовые компоненты и бренд | Done (agent) | `D06–D08` | Button/Field/Select/Dialog/Tabs/Table/Empty/Error/Toast/Money, /dev/components, единый формат ошибок |
| D09 | Проверка базы (G1) | Done (agent) | `D09–D11` | миграции на чистой БД (FK/CHECK/триггеры), 21 экран на 390/1440, запуск по README с нуля |
| D10 | Симулятор котировок | Done (agent) | `D09–D11` | детерминированный симулятор, MarketDataProvider, Quote/Candle кеш, /dev/quotes |
| D11 | Доставка обновлений | Done (agent) | `D09–D11` | SSE (ADR 0003), snapshot+seq, одна EventSource на вкладку, refcount, backoff |
| D12 | Списки рынков и выбор инструмента | Done (agent) | `D12–D13` | Markets hub + Coming soon, AssetPicker (поиск/категории), `?symbol=` в URL, not found / чужой рынок |
| D13 | График и периоды | Done (agent) | `D12–D13` | индекс Candle + UTC, свечи с диапазоном/лимитом, Lightweight Charts 5 (ADR 0004), периоды 24h/1W/1M/1Y/All |
| D10+ | Живые справочные цены (расширение D10) | Done (agent) | `D10+: live reference feeds` | ADR 0005: Binance — crypto (цена, bid/ask, свечи, стакан), Twelve Data — forex, акции США, драгметаллы (приоритет открытого инструмента, лимиты 8/мин и 800/сутки). Индексы (Massive), энергоносители и агро — ждут ключей |
| D08+ | Иконки инструментов как в прототипе | Done (agent) | `D08+: instrument icons` | ADR 0006 — отступление от критерия D08 «нет чужих логотипов» по решению владельца; 141 иконка + 28 флагов |
| D10+ | Индексы EOD (Massive) и история энергоносителей (EIA) | Done (agent) | `D10+: indices EOD, energy history` | ADR 0007: индексы по итогам дня — Massive (NDX, IXIC), FRED (SPX, DJI, VIX, N225); WTI/Brent/газ/бензин/мазут от закрытий EIA + помеченная симуляция |
| D14+ | — | Not started | | вне текущего объёма |
