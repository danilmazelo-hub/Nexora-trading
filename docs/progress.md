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
| D09 | Проверка базы (G1) | Not started | | |
| D10 | Симулятор котировок | Not started | | |
| D11 | Доставка обновлений | Not started | | |
| D12 | Списки рынков и выбор инструмента | Not started | | |
| D13 | График и периоды | Not started | | |
| D14+ | — | Not started | | вне текущего объёма |
