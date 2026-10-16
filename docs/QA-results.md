# Результаты проверок

Среда: Windows 11, Node 24.20.0, pnpm 10.34.7, PostgreSQL 18.4 (embedded, localhost:5433), Chromium (Playwright).
Seed рынка 20261015. Формат: ID · команда/шаги · ожидание · факт · статус.

## D00–D02 (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D00 | `pnpm docs:links` | нет битых ссылок | см. прогон перед commit | Passed |
| D01 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | все зелёные | lint 0 ошибок; typecheck ok; unit 14+3+6 passed; build ok | Passed |
| D01 | `curl /health/live` (API и через proxy `:5173/api`) | 200 `{status:"ok"}` + x-request-id | 200, `req_…` | Passed |
| D02 | `pnpm db:stop` → `/health/ready`, `/health/live` | ready 503 `database:down`, live 200 | 503 / 200 | Passed |
| D02 | `pnpm db:start` → `/health/ready` без перезапуска API | 200 | 200 | Passed |
| D02 | integration `health.int.test.ts` | live/ready/404-формат; БД недоступна → 503 без реквизитов | 5 passed | Passed |
| D02 | Экран «API недоступен» / «БД недоступна» + «Повторить» | понятный текст, автоповтор 5 с | реализован (`ApiGate`), e2e — в D07 | Passed (ручная) |
| D02 | Данные переживают перезапуск БД | сессия сохраняется после stop/start | проверяется после D03 | Not run → см. D03 |
