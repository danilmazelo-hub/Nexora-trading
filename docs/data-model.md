# Модель данных

## Когда читать
Перед изменением `apps/api/prisma/schema.prisma`, миграций, денежной логики или источников истины.

## Источники истины
| Данные | Источник | Браузер может |
|---|---|---|
| Денежный остаток | Сумма проводок `LedgerEntry` по счёту и активу | только читать |
| Владелец счёта | `DemoSession` из серверной cookie | — |
| Цена демо | Симулятор (`MarketSettings.seed` + часы), кеш `Quote`/`Candle` | только читать |
| Справочник | Таблица `Instrument` (seed из `apps/api/prisma/catalog.ts`) | только читать |
| Язык/имя профиля | `DemoProfile` | менять через API |
| Вкладка, период графика, открытый диалог | URL и UI-состояние | да |

Браузер передаёт намерение (команду), сервер определяет результат. Баланс, владельца и цену исполнения браузер не задаёт.

## Сущности (вводятся по задачам)
| Задача | Сущность | Ключевые поля и ограничения |
|---|---|---|
| D03 | `DemoSession` | `id` uuid; `tokenHash` (sha-256 случайного 32-байтного токена cookie, unique); `expiresAt`, `lastSeenAt`, `revokedAt`; `scenario` |
| D03 | `DemoProfile` | 1:1 с сессией; `displayName`, `locale` (`ru`/`en`), timestamps |
| D03 | `Account` | `sessionId` FK + индекс; `kind` (`MAIN`), `currency`, `status` (`ACTIVE`/`ARCHIVED`), timestamps |
| D04 | `Instrument` | `id` (внутренний, напр. `crypto.BTC-USD`); `market`, `symbol`, `name`, `baseAsset`, `quoteAsset`, `tickSize`, `quantityStep`, `contractMultiplier` (numeric > 0), `maxLeverage`, `categories[]`, `status`, `source`, `refPrice`, `dailyVolatility`; unique (`market`,`symbol`) |
| D05 | `LedgerAccount` | владелец: `accountId` (пользовательский) **или** `systemCode` (`DEMO_FUNDING`, `DEMO_PNL`, `FEES`); `asset`; unique (`accountId`,`asset`), unique (`systemCode`,`asset`), unique (`id`,`asset`) |
| D05 | `LedgerTransaction` | `scope` (sessionId или `system`), `idempotencyKey`, `requestHash`, `type`, `reversalOfId`; unique (`scope`,`idempotencyKey`) |
| D05 | `LedgerEntry` | `transactionId`, (`ledgerAccountId`,`asset`) составной FK → `LedgerAccount(id, asset)`; `amount` numeric(38,18) со знаком |
| D06 | `MarketSettings` | одна строка `default`: `seed`, `clockMode` (`REALTIME`/`FIXED`), `fixedAt` |
| D06 | `DemoSession.scenario` | `STARTER` / `EMPTY_PORTFOLIO` / `QUOTES_UNAVAILABLE` / `OPERATION_FAILURE` |
| D10 | `Quote` | последний снимок: `instrumentId`, `source`, `bid`, `ask`, `last`, `changePct`, `changePeriod`, `observedAt`, `receivedAt`; unique (`instrumentId`,`source`) |
| D10/D13 | `Candle` | `instrumentId`, `source`, `interval`, `openTime` (UTC), OHLCV numeric; unique (`instrumentId`,`source`,`interval`,`openTime`); индекс (`instrumentId`,`interval`,`openTime`) |

Будущие сущности (Order/Fill/Position, MarginReservation, Subscription, Conversation и т.д.) вводятся в своих задачах D14+.
Таблицы заранее не создаются.

## Инварианты журнала (D05)
1. Сумма `amount` проводок одной транзакции равна нулю **отдельно по каждому активу**. Проверяется в сервисе и
   отложенным constraint-триггером в БД (`ledger_entries_balanced`), срабатывающим в конце транзакции.
2. Актив проводки совпадает с активом её `LedgerAccount` (составной внешний ключ) — USD и BTC не складываются.
3. Повтор команды с тем же `idempotencyKey` в той же области и тем же телом возвращает уже созданную транзакцию;
   с другим телом — ошибка `IDEMPOTENCY_CONFLICT` (409).
4. Проводки не изменяются и не удаляются; исправление — обратная транзакция с `reversalOfId`.
5. Транзакция и все её проводки пишутся атомарно (одна транзакция БД).

Знаковая конвенция: поступление на пользовательский счёт положительное, системный встречный счёт — отрицательный.
Пример стартового пополнения: user USD +50000, `DEMO_FUNDING` USD −50000.

## Reset (D06)
Reset архивирует активные счета **текущей** сессии и создаёт новые с пополнением 50 000 USD (новый ключ
`funding:<accountId>`). Старые проводки остаются (append-only), чужие сессии не затрагиваются.

## Единицы
- Деньги/количества: numeric(38,18) в БД, decimal-строки в JSON (`"50000.00"` нормализуется до точности актива).
- Проценты: всегда **процентные пункты** (`"0.9724"` = 0,9724 %). Источники в долях проходят `normalizePercent(value, 'fraction')`.
- Время: `timestamptz` UTC; ISO-8601 в JSON.
