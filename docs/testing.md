# Проверки и тестовые окружения

## Когда читать
Перед запуском или добавлением тестов, перед commit.

## Уровни
| Уровень | Где | Команда | Требует |
|---|---|---|---|
| Unit | `packages/contracts/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.tsx` | `pnpm test` | ничего |
| Integration | `apps/api/test/*.int.test.ts` | `pnpm test:integration` | запущенный PostgreSQL (`pnpm db:start`) |
| E2E | `tests/e2e/*.spec.ts` (Playwright, Chromium) | `pnpm test:e2e` | запущенные `pnpm dev` (или Playwright поднимет их сам) |

## Тестовая БД
Integration-тесты используют **только** `nexora_test` (`DATABASE_URL_TEST` из `apps/api/.env`, по умолчанию
`postgresql://nexora:nexora@localhost:5433/nexora_test`). Перед прогоном `apps/api/test/global-setup.ts` применяет
миграции (`prisma migrate deploy`) и очищает таблицы тестовой БД (TRUNCATE). Dev-БД `nexora` тесты не трогают;
проверка в global-setup отказывается работать, если имя БД не оканчивается на `_test`.

## Фикстуры
Фиксированный seed рынка `20261015`, часы задаются через `MARKET_FIXED_TIME` в тестах. Данные полностью вымышленные.

## E2E
Playwright запускает Chromium; каждый тест получает новый browser context (собственная cookie-сессия).
Скриншоты 390/1440 px — `tests/e2e/screens.spec.ts`, артефакты в `test-results/` (вне git).
