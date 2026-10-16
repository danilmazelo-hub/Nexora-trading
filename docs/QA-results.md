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
| D02 | Данные переживают перезапуск БД | сессия и остаток сохраняются после `db:stop`/`db:start` | та же сессия и 50000.00 USD; во время остановки 503 | Passed |

## D03–D05 (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D03 | integration `session.int.test.ts` (8) | cookie HttpOnly/Lax, хранится только hash; resume; два контекста — разные счета; чужой accountId → 404; без cookie/подделка → 401; истёкшая → 401 SESSION_EXPIRED; выход отзывает | 8 passed | Passed |
| D03 | e2e `session.spec.ts` (5) | вход, два контекста, редирект на /demo и возврат, reload сохраняет, потеря cookie → /demo | 5 passed | Passed |
| D04 | integration `instruments.int.test.ts` (12) | BTC/AAPL/SPX/EUR-USD/XAU — корректные метаданные строками; Live Cattle = livestock; неизвестный → 404; поиск/пагинация/сортировка | 12 passed | Passed |
| D04 | `pnpm db:seed` ×2 | 204 инструмента, без дублей | 204 / 204 | Passed |
| D05 | unit `ledger-rules.test.ts` (7) | баланс по активу, USD+BTC не неттятся, точная арифметика, hash | 7 passed | Passed |
| D05 | integration `ledger.int.test.ts` (10) | стартовые 50 000; две одинаковые команды → одна операция; другой body → 409; откат при сбое; USD/BTC → LEDGER_UNBALANCED/ASSET_MISMATCH; триггеры БД; сторно | 10 passed | Passed |
| D05 | Полная проверка: `pnpm install --frozen-lockfile`, lint, typecheck, test, test:integration, build, test:e2e | всё зелёное | 0 ошибок lint; 30 unit; 35 integration; 5 e2e; build ok | Passed |
| D05 | Ручной просмотр `/demo` 1440 px | вход, баланс $50 000,00 | скриншот: корректно | Passed |
