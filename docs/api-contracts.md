# API-контракты

Схемы — `packages/contracts/src/schemas.ts` (zod; web проверяет ими ответы). Базовый адрес API — `http://localhost:3001`;
браузер обращается через `/api/*` (Vite proxy снимает префикс). Время — ISO-8601 UTC; деньги, цены, количества —
decimal-строки; проценты — процентные пункты (`"0.97"` = 0,97 %).

## Общие правила
| Тема | Правило |
|---|---|
| Ошибка | HTTP 4xx/5xx + `{ code, message, fieldErrors?, requestId }`; коды — `ERROR_CODES` в `packages/contracts/src/errors.ts` |
| Request id | заголовок ответа `x-request-id` (входящий безопасный id переиспользуется) |
| Сессия | cookie `nexora_demo` (HttpOnly, SameSite=Lax). Защищённые маршруты без сессии → 401 `SESSION_REQUIRED`, истёкшая → 401 `SESSION_EXPIRED` |
| Владелец | только из сессии; чужой объект → 404 (`ACCOUNT_NOT_FOUND` и т.п.) |
| Идемпотентность | денежные команды принимают заголовок `Idempotency-Key`; тот же ключ + то же тело → тот же результат; другое тело → 409 `IDEMPOTENCY_CONFLICT` |
| Валидация | 400 `VALIDATION_FAILED` с `fieldErrors` |

## Health (D01–D02)
| Метод | Путь | Ответ |
|---|---|---|
| GET | `/health/live` | 200 `HealthLive` — процесс жив, БД не проверяется |
| GET | `/health/ready` | 200 `{status:"ok",checks:{database:"up"}}` или 503 `{status:"unavailable",checks:{database:"down"}}` |

## Демосессия и профиль (D03)
| Метод | Путь | Auth | Тело / ответ |
|---|---|---|---|
| POST | `/demo/session` | — | `{ locale? }` → 200 `SessionState`. Создаёт сессию (cookie `nexora_demo`) или возобновляет действующую (`session.resumed=true`). Истёкшая cookie → новая сессия |
| GET | `/demo/session` | cookie | `SessionState` (сессия, профиль, активные счета) |
| DELETE | `/demo/session` | cookie | 204; сессия отзывается, cookie очищается |
| PATCH | `/me/profile` | cookie | `{ displayName? (2–40), locale? 'ru'|'en' }` → `SessionState` |
| GET | `/me/accounts` | cookie | `{ items: Account[] }` — только счета текущей сессии |
| GET | `/me/accounts/:id` | cookie | `Account`; чужой/несуществующий → 404 `ACCOUNT_NOT_FOUND` |

## Справочник (D04, D12) — публичный
| Метод | Путь | Параметры / ответ |
|---|---|---|
| GET | `/markets` | `{ items: MarketSummary[] }` — 5 рынков `active` с числом инструментов и категориями + `coming_soon` |
| GET | `/instruments` | `market?`, `category?`, `q?` (символ/имя/id, без учёта регистра), `sort=symbol|name|market`, `dir=asc|desc`, `page≥1`, `pageSize 1–100` → `InstrumentPage` |
| GET | `/instruments/:id` | `Instrument` (tickSize, quantityStep, contractMultiplier — decimal-строки); неизвестный → 404 `INSTRUMENT_NOT_FOUND` |

## Журнал денег (D05)
| Метод | Путь | Auth | Тело / ответ |
|---|---|---|---|
| GET | `/me/accounts/:id/balances` | cookie | `AccountBalances` — остаток по каждому активу = сумма проводок; активы не суммируются между собой |
| POST | `/me/accounts/:id/demo-credit` | cookie + `Idempotency-Key` | `{ amount: "0.01"–"10000" }` → `{ transactionId, replayed, balances }`. Тестовая демо-операция панели сценариев. Повтор ключа с тем же телом → тот же `transactionId`, `replayed=true`; другое тело → 409. В сценарии `OPERATION_FAILURE` → 503 `DEMO_OPERATION_FAILED`, ничего не проведено |

Ошибки журнала: 422 `LEDGER_UNBALANCED` (сумма по активу ≠ 0), 422 `LEDGER_ASSET_MISMATCH`, 409 `IDEMPOTENCY_CONFLICT`.

## Сценарии и reset (D06)
| Метод | Путь | Auth | Тело / ответ |
|---|---|---|---|
| GET | `/demo/scenarios` | cookie | `{ items: [{ id, title, description, resets }] }` — `STARTER`, `EMPTY_PORTFOLIO`, `QUOTES_UNAVAILABLE`, `OPERATION_FAILURE` |
| POST | `/demo/reset` | cookie | `{ confirm: true, scenario? }` → `SessionState`. Без `confirm: true` → 400 `RESET_NOT_CONFIRMED`. Архивирует активные счета **только своей** сессии и создаёт новый счёт с 50 000 USD |
| PUT | `/demo/scenario` | cookie | `{ scenario }` → `SessionState`; меняет поведение без изменения денег |

## Capabilities (D07) — публичный
| Метод | Путь | Ответ |
|---|---|---|
| GET | `/capabilities` | `{ mode:"demo", realMoney:false, priceSource:"simulator", sections:[{ id, path, status: available|in_development|coming_soon, simulated, tasks }] }` |
