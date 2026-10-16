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

## Рыночные данные (D10–D13) — публичные; при cookie действует сценарий сессии
| Метод | Путь | Параметры / ответ |
|---|---|---|
| GET | `/market/status` | `{ source, seed, clockMode: REALTIME|FIXED, now, streams, feeds }`; `feeds` — включённые справочные источники по рынкам `{ crypto: { source: "binance", active } , forex: { source: "twelvedata", active, usage } }` (`usage` — расход кредитов Twelve Data, без ключа) |
| GET | `/market/quotes/:id` | `Quote`: `bid/ask/last/change` — decimal-строки по шагу цены, `changePct` — процентные пункты, `changePeriod` `24h` (крипта) или `prev_close` (остальные, к закрытию предыдущего UTC-дня), `observedAt` (время цены, кратно 2 с), `receivedAt`, `status` `live|delayed|eod|stale|unavailable` (`eod` — закрытие последней сессии, индексы Massive). Нет цены → все цены `null`, `status: unavailable` |
| GET | `/market/quotes?ids=a,b` | `{ items: Quote[], asOf }`, 1–60 id; неизвестные id пропускаются |
| GET | `/market/stream?ids=a,b` | SSE, событие `quotes` `{ seq, kind: snapshot|update, quotes }`, `id = seq`. Первое событие — snapshot (также после reconnect с `Last-Event-ID`); далее одно update на 2-секундный тик. См. [ADR 0003](decisions/0003-quote-stream-sse.md) |
| GET | `/market/instruments/:id/candles` | `interval=5m|15m|1h|4h|1d|1w`, `from?`, `to?` (ISO UTC), `limit 1–1000` (по умолчанию 500) → `CandlesResponse { instrumentId, source, interval, from, to, truncated, candles: [{ openTime, closeTime, open, high, low, close, volume, isClosed }] }`. Свечи по возрастанию, без дублей, без будущих; последняя — формирующаяся (`isClosed:false`), её `close` = текущей котировке. `from > to` → 400. Недели начинаются в понедельник 00:00 UTC; история с 2022-01-03 |

| GET | `/market/instruments/:id/orderbook` | `depth 1–50` (10) → `OrderBook { instrumentId, source, status: live|unavailable, bids, asks: [{ price, quantity }], observedAt }`. Только crypto с Binance; иначе `unavailable` и пустые стороны (стакан не выдумывается) |

Источник цены инструмента один для котировки, потока и свечей: справочный feed рынка (ADR 0005, `source` `binance` /
`twelvedata`) при `MARKET_LIVE_FEEDS` и часах REALTIME, иначе `SimulatorProvider` (`simulator:<seed>`). Twelve Data обслуживает forex, акции США и XAU/XAG/XPT/XPD; Massive, затем FRED — индексы по итогам дня (свечи только 1d/1w,
внутридневные — пустой список); EIA — энергоносители (`eia-sim`, ADR 0007); символ, отклонённый тарифом, переходит на симулятор. `status`: Binance —
`live` (старше 30 с → `stale`), Twelve Data — `delayed` (старше 45 мин → `stale`), симулятор — `live` / `delayed` при фиксированных часах.
Нет истории у feed (лимит, сбой) → 503 `QUOTES_UNAVAILABLE`.
