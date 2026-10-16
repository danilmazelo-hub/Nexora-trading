# NEXORA — контракты API для backend

Фронтенд обращается к данным **только** через `NX.api` (`js/data/api.js`). Сейчас транспорт —
встроенный демо-сервер `NX.server` (`js/data/demo-server.js`) с имитацией задержки и ошибок.
Чтобы подключить настоящий backend, замените функцию `transport()` в `api.js` на `fetch()`/WebSocket
по таблице ниже — имена методов и форма данных в компонентах не меняются.

Типы данных: [`docs/types.d.ts`](types.d.ts). Все даты — Unix ms (UTC), деньги — USD, если не указано иное.

## Общие правила

| Тема | Требование |
|---|---|
| Аутентификация | Сессия/токен выдаёт сервер (OAuth2/OIDC или собственный auth). Демо-переключение ролей во фронтенде — **только для показа**. |
| Права доступа | Сервер проверяет право на **каждый** запрос (см. `Permission` в types.d.ts). Клиент видит только свои данные (`clientId` из токена, а не из запроса). |
| Внутренние данные CRM | `notes`, `tasks`, `interactions`, `source`, `tags` никогда не отдаются в клиентские эндпоинты. |
| Ошибки | `HTTP 4xx/5xx` + тело `{ "code": "err.funds", "vars": {...} }`. Коды совпадают с ключами i18n (`js/core/i18n-dict.js`, раздел errors). |
| Идемпотентность | `POST /orders`, `POST /payments/*` принимают заголовок `Idempotency-Key`. |
| Пагинация | `?page=&pageSize=` → `Page<T>`. |
| Числа | Цены и количества — строки-десятичные или decimal на сервере; фронтенд округляет по `decimals`/`qtyStep`. |

## Рынок

| Метод `NX.api` | REST / WS | Ответ |
|---|---|---|
| `market.instruments()` | `GET /instruments` | `Instrument[]` (с учётом настроек админа: `enabled`, `spreadBps`, `feeRate`) |
| `market.fees()` | `GET /fees` | `{ fees, withdrawFees, minOrderUsd, minDepositUsd, minWithdrawUsd }` |
| `market.quote(id)` | `GET /quotes/{id}` | `Quote` (с `high24/low24/volume24`) |
| `market.quotes(ids)` | `GET /quotes?ids=` | `Quote[]` |
| `market.candles(id, tf, limit)` | `GET /candles/{id}?tf=1h&limit=400` | `Candle[]` по возрастанию времени; последняя свеча может формироваться |
| `market.changeOver(id, period)` | `GET /heatmap?market=&period=1d` | `PeriodChange` / список для heatmap |
| `market.subscribe(fn)` | `WS /stream` каналы `quotes`, `candles:{id}:{tf}` | push-обновления котировок и последней свечи |

**Согласованность.** Котировка, последняя свеча, heatmap и оценка позиций должны браться из одного источника цен
(в демо — `NX.market.price(id, t)`). Позиции оцениваются по `bid`, покупка исполняется по `ask`, продажа — по `bid`.

### Текущая реализация живых цен (этап тестирования)

`tools/serve.py` + `tools/providers.py` — шлюз котировок с цепочками «основной → запасные» по разделам, кэшем, учётом лимитов,
circuit breaker и метриками (доступность, средний отклик, p95):
`GET /api/live/status`, `GET /api/live/quotes?section=&ids=`, `GET /api/live/candles?section=&id=&tf=&limit=`,
`GET /api/live/book?id=&depth=` (стакан криптовалют: Binance → OKX, ответ `{symbol, src, srcLabel, fallback, bids:[[price, qty]], asks:[[price, qty]], t}`),
`GET /api/live/benchmark`, `POST /api/live/config {section, chain, disabled}`.
Ответ котировки содержит `src` (провайдер) и `fallback` (true — данные от запасного API).
В production шлюз переносится в backend: те же цепочки, плюс WebSocket-рассылка, мониторинг/алерты и лицензированные источники.

## Кабинет клиента

| Метод | REST | Тело / ответ |
|---|---|---|
| `auth.login(email)` | `POST /auth/login` | `{email, password}` → токен. В демо пароль не передаётся и не хранится. |
| `auth.register(data)` | `POST /auth/register` | `{name, email, password, country}` → `ClientSelf`; создаётся `Client` (stage `registered`) и счёт |
| `auth.recover(email)` | `POST /auth/recover` | всегда `202`, письмо отправляет сервер |
| `me.get()` / `me.update(patch)` | `GET/PATCH /me` | `ClientSelf`; разрешены `name, phone, country, language` |
| `me.submitKyc()` | `POST /me/kyc` (multipart) | документы загружаются **только** в KYC-провайдера; статус → `pending` |
| `trading.account(id)` | `GET /accounts/{id}` | `AccountSummary` |
| `trading.orders(id, status?)` | `GET /accounts/{id}/orders?status=open` | `Order[]` |
| `trading.trades(id)` | `GET /accounts/{id}/trades` | `Trade[]` |
| `trading.preview(id, req)` | `POST /accounts/{id}/orders/preview` | `OrderPreview` (фронт считает локально для мгновенного отклика) |
| `trading.placeOrder(id, req)` | `POST /accounts/{id}/orders` | `{ order: Order, trade: Trade \| null }` |
| `trading.cancelOrder(orderId)` | `DELETE /orders/{id}` | `Order` |
| `payments.list()` | `GET /me/payments` | `Payment[]` |
| `payments.createDeposit(req)` | `POST /me/deposits` | `{asset, network, amount}` → `Payment` (`awaiting`) + адрес от кастодиана |
| `payments.createWithdrawal(req)` | `POST /me/withdrawals` | `{asset, network, address, amount}` → `Payment` (`review`), сумма + комиссия замораживается |
| `payments.cancel(id)` | `POST /me/payments/{id}/cancel` | только `awaiting`/`review` |
| `notifications.list()` / `markRead(ids)` | `GET /me/notifications`, `POST /me/notifications/read` | `Notification[]` |
| `support.list()` / `create()` / `reply()` | `GET/POST /me/tickets`, `POST /tickets/{id}/messages` | `Ticket` |

### Правила исполнения ордера (серверная проверка обязательна)

1. Инструмент и рынок включены; счёт не заблокирован.
2. `qty` > 0 и кратно `qtyStep`; стоимость ≥ `minOrderUsd`.
3. **Покупка:** `qty × ask × fx + fee ≤ cash − reserved`. Списывается `notional + fee`, позиция увеличивается, `costUsd += notional + fee`.
4. **Продажа:** `qty ≤ position.qty − qty в открытых sell-лимитах`. Зачисляется `notional − fee`;
   `realizedPnl = notional − fee − costUsd × qty/position.qty`. Если остаток < `qtyStep/2` — позиция удаляется.
5. Комиссия: `max(min, notionalUsd × rate)`; `rate` — по рынку или индивидуальная по инструменту.
6. Лимитный buy резервирует `qty × limit × fx + fee`; исполняется, когда `ask ≤ limit` (sell — когда `bid ≥ limit`).

Коды ошибок: `err.funds`, `err.qtyExceeds`, `err.noPosition`, `err.qty`, `err.limitPrice`, `err.minNotional`,
`err.instrumentDisabled`, `err.accountBlocked`, `err.orderNotOpen`, `err.forbidden`.

## CRM и администрирование

| Метод | REST | Право |
|---|---|---|
| `crm.dashboard()` | `GET /crm/dashboard` | `crm.view` |
| `crm.clients(query)` | `GET /crm/clients?search=&stage=&managerId=&kyc=&sort=&dir=&page=&pageSize=` → `Page<Client & {equity, deposits, managerName}>` | `crm.view` |
| `crm.client(id)` | `GET /crm/clients/{id}` → клиент + `account`, `orders`, `trades`, `payments`, `notes`, `tasks`, `interactions`, `tickets` | `crm.view` (+`crm.notes` для заметок) |
| `crm.createClient(data)` | `POST /crm/clients` | `crm.clients.create` |
| `crm.updateClient(id, patch)` | `PATCH /crm/clients/{id}` (`stage`, `managerId`, `kyc`, контакты, `tags`, `accountStatus`) | `crm.clients.edit`, `crm.assign` для `managerId` |
| `crm.addNote / deleteNote / togglePin` | `POST/DELETE/PATCH /crm/clients/{id}/notes` | `crm.notes` |
| `crm.logInteraction(id, type, text)` | `POST /crm/clients/{id}/interactions` | `crm.clients.edit` |
| `crm.tasks(q) / createTask / updateTask` | `GET/POST/PATCH /crm/tasks` | `crm.tasks` |
| `support.update(id, patch)` | `PATCH /crm/tickets/{id}` (`status`, `assigneeId`) | `crm.tickets` |
| `payments.pending()` / `payments.review(id, ok, reason)` | `GET /crm/withdrawals?status=review`, `POST /crm/withdrawals/{id}/approve|reject` | `payments.approve` |
| `admin.staff() / saveStaff()` | `GET/POST/PATCH /admin/staff` | `admin.staff` |
| `admin.roles() / setPermission()` | `GET/PATCH /admin/roles` | `admin.roles` |
| `admin.setInstrument / setMarket` | `PATCH /admin/instruments/{id}`, `PATCH /admin/markets/{market}` | `admin.instruments` |
| `admin.setFees(fees, withdrawFees, limits)` | `PUT /admin/fees` | `admin.fees` |
| `admin.settings() / saveSettings()` | `GET/PATCH /admin/settings` | `admin.settings` |

Изменения в CRM (этап, менеджер, KYC, ответы в обращениях, одобрение выводов) должны порождать события
(`interactions` + `notifications`) и рассылаться в кабинет клиента через WebSocket, как это делает демо-сервер.

## Только для демо (удалить при подключении backend)

`admin.setClock()` (пауза симуляции), `admin.resetDemo()`, `payments.simulateArrival()`, настройки `latencyMs`/`failRate`,
файлы `js/data/market.js`, `ledger.js`, `seed.js`, `demo-server.js`.
