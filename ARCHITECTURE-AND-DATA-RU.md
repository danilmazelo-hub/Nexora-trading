# EasyTrade — архитектура и данные

Это выбранная модель нового приложения, а не реконструкция закрытого сервера оригинала. Перед разработкой прочитай универсальный [гайд правил](AI-AGENT-PROJECT-STRUCTURE-GUIDE-RU.md). Уточнения модели фиксируются в ADR и одновременно в плане/проверках.

## Структура приложения

```text
easytrade/                         # отдельный репозиторий приложения
├── CLAUDE.md                      # общие правила и индекс
├── README.md                      # действующие команды и запуск
├── package.json                   # корневые scripts и packageManager
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── docker-compose.yml             # локальная БД
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── api-contracts.md
│   ├── acceptance.md
│   ├── screen-inventory.md
│   ├── progress.md
│   ├── QA-results.md
│   └── decisions/
├── apps/
│   ├── api/
│   │   ├── CLAUDE.md
│   │   ├── docs/                  # backend-темы из гайда
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── src/modules/           # session, ledger, markets, orders...
│   │   ├── src/domain/            # чистая математика/правила
│   │   ├── src/infra/             # БД, адаптеры, события
│   │   └── .env.example
│   └── web/
│       ├── CLAUDE.md
│       ├── docs/                  # frontend-темы из гайда
│       ├── src/app/               # routes, providers, shell, brand
│       ├── src/modules/           # finance, trading, ai, settings...
│       ├── src/shared/            # UI и общие адаптеры
│       ├── src/locales/           # RU/EN
│       └── .env.example
├── packages/contracts/            # общие схемы/DTO, API-error, decimal strings
└── tests/e2e/
```

Фактические имена команд и конфигураций библиотек агент создаёт в D01 после проверки актуальной документации. Дерево — целевая модель; наличие этого документа не означает, что файлы приложения уже созданы.

Монолит разделён на модули. Контроллер → use case → repository → БД; внешние провайдеры за интерфейсами. На клиенте: schema/api/hooks/components/index, отдельно UI-состояние и кеш сервера. Web не импортирует ORM-модели/секреты сервера. Бизнес-математика не дублируется в React.

## Источники истины

| Данные | Источник |
|---|---|
| Денежный баланс | Серверный ledger и принятые проводки |
| Доступный остаток и маржа | Один серверный snapshot с asOf/version |
| Ордер/позиция/исполнение | Серверные state machines, БД и события |
| Цена демо | Один симулятор с seed/clock; в расширении — выбранный адаптер |
| История свечей | Согласованный provider и серверный кеш/хранилище |
| Права/тариф/владелец | Серверная сессия и entitlements |
| Язык/профиль | Серверный профиль, отображение через RU/EN словари |
| Выбор вкладки/диалога | URL и UI-store, без авторитетных денежных значений |

Браузер может кешировать ответ, но не устанавливает баланс, владельца, paid, verified или execution price. Команда передаёт намерение, сервер определяет результат.

## Схема вводится постепенно

| Пакет | Сущности и связи | Основные ограничения |
|---|---|---|
| D03 | DemoSession → DemoProfile; DemoSession → Accounts | случайный id, срок жизни, ownership, account currency/type |
| D04 | Instrument; Category/Market metadata | unique internal symbol+market/venue, tick/step > 0, единицы |
| D05 | LedgerTransaction → Entries → Account; системные counterpart accounts | unique idempotency scope, атомарность, баланс по каждому активу |
| D06 | SeedScenario/ScenarioState | версия сценария, seed/clock, reset только своего scope |
| D10–D13 | Quote/Candle или их серверный кеш | instrument/source/timestamps, unique candle interval/time |
| D14–D18 | Order → Fills → Position; MarginReservation | decimal, owner/account FK, версии/статусы, неотрицательный резерв |
| D25–D27 | AccountSnapshot, DemoTransaction | тип/метод/status, связь с журналом, разделение двух историй |
| D29–D31 | Spot account/Network, Transfer/SwapQuote | актив+сеть, expiry, атомарность двух валютных сторон |
| D32 | Plan → Subscription → Entitlements | один конфиг лимитов, период/UTC-сброс, server validation |
| D33–D34 | Conversation → Messages → DemoAction | ownership, ссылка order/chat, явное подтверждение |
| D35 | Ventures account/Allocation/Transfer | сохранение суммы по валюте, заданные пороги |
| D36 | VerificationCase → Requirements/Events/TestAssets | переходы, synthetic fixtures, серверный статус |
| D37–D41 | Preferences/Notifications/ReadState/SupportThread | владелец, понятный lifecycle и лимиты |
| R02–R11 | User/Identity/LiveAccount/ProviderEvent/Outbox/Inbox/Reconciliation | строгие demo/live границы, внешние id, audit trail |

Не создавать все таблицы и миграции будущих интеграций в D03. Каждая задача вводит только нужный кусок, проверяет его и сохраняет миграцию в репозиторий. Деньги и количества в PostgreSQL — точные decimal/numeric с согласованными пределами; в JSON — строки. Тип number для итоговой финансовой арифметики не использовать. Отдельная decimal-библиотека выбирается/фиксируется агентом в D01, её округления проверяются в D14.

## Единицы и математика демо

- `quantity` — количество базовых единиц инструмента; `lots` — отдельное представление через contract size. Не перемножать quantity на размер лота повторно.
- `notional = abs(quantity × entryPrice × contractMultiplier)` в валюте котировки с нужной конвертацией.
- `initialMargin = notionalInAccountCurrency / leverage`. В демо резерв первоначальной маржи фиксируется при входе до закрытия. Пересчёт/ликвидация реального продукта определяется брокером в R05.
- Для линейного продукта: `unrealizedPnl = direction × quantity × contractMultiplier × (mark - entry)`, затем перевод в валюту счёта; direction Buy=+1, Sell=-1.
- Плечо влияет на размер необходимой маржи. Если quantity уже определена, PnL дополнительно на плечо не умножать.
- `balance` — проведённый cash ledger после реализованного результата и комиссий.
- `equity = balance + unrealizedPnl`.
- `available = equity - usedMargin - pendingOrderReservations - withdrawalReservations`. Одна и та же резервная сумма учитывается один раз, категории не перекрываются.
- `riskPercent = usedMargin / equity × 100` при equity > 0; при equity <= 0 показывается определённое состояние риска и блокируются новые сделки. Не выдавать эту простую метрику за полноценную брокерскую risk engine.
- Отдельно показываются `PnL / balance` и `ROI / usedMargin`; при нулевом знаменателе — прочерк/пояснение.

Bid/ask/last/mark — разные понятия. Опиши цену открытия/закрытия Buy/Sell и источник mark/TP/SL. В независимых числовых тестах используй фиксированные цены и нулевой spread, затем отдельные тесты ненулевого spread. Не сравнивай произвольную живую цену с заранее зафиксированным ожидаемым PnL.

Комиссии имеют момент признания, валюту, precision и правило округления. Сначала считать с высокой точностью, затем округлять в определённых местах. Отображение `-0.00` заменять понятным значением; ненулевой объём не скрывать визуальным нулём.

## Пример двойной записи

Используй одну согласованную знаковую конвенцию в коде и тестах. Для демо удобно хранить signed amount: поступление на пользовательский asset-account положительное, расход отрицательный.

- Начальное пополнение: user cash +50 000 USD, system demo funding −50 000 USD.
- Перевод main→ventures: main cash −100 USD, ventures cash +100 USD.
- Реализованная прибыль: user cash +10 USD, system demo PnL −10 USD.
- Комиссия: user cash −0.10 USD, system fee +0.10 USD.

Сумма entries одной transaction равна нулю **отдельно по каждому активу**. Swap USD→BTC требует балансируемой USD-стороны и отдельно балансируемой BTC-стороны с системными встречными счетами; нельзя складывать USD и BTC как одно число. Курс, количество и комиссия привязаны к принятому quote id.

Открытие маржинальной демопозиции резервирует маржу, но не списывает весь notional из cash. Закрытие освобождает резерв и проводит результат/комиссию. Существующую проводку не переписывают: ошибка исправляется связанной обратной/корректирующей операцией. Для реальных средств эта модель проходит отдельный профессиональный review.

## Состояния

| Объект | Минимальный lifecycle |
|---|---|
| Market order | submitted → filled либо rejected |
| Pending order | pending → triggered (для stop) → filled либо cancelled/rejected |
| Stop Limit | trigger открывает limit-заявку, не гарантирует немедленный fill |
| Position | open → closing → closed; сохраняется reason и связь fill |
| Demo money operation | created → pending → succeeded/failed/cancelled/expired |
| Swap quote | active → accepted либо expired |
| Verification | not_started → in_progress → approved/rejected/resubmit |
| Message | draft → sending → answered/failed/cancelled |

У каждого перехода есть серверная проверка владельца, предусловий и допустимого предыдущего состояния. Дубли безопасны, гонки close/trigger и cancel/fill имеют одного победителя. Клиентский timeout не доказывает, что операция не состоялась.

## Что не строить заранее

Микросервисы, Kafka/Redis-кластер, настоящую CRM, неподтверждённые рынки Coming soon и автоторговлю без согласованного сценария. Для первого демо достаточно модульного API и PostgreSQL. Outbox/inbox и внешняя сверка обязательны перед live-интеграциями; источником денег не становится состояние страницы.
