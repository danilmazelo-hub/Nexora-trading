# Реестр экранов, вкладок, окон и состояний

Источник карты — [план](handoff/EASYTRADE-IMPLEMENTATION-PLAN-RU.md#карта-всех-обязательных-экранов). Для каждого экрана
определены данные, действия и состояния loading/empty/error. Колонка «Статус» — фактическое состояние в коде:
**Ready** — функция реализована и проверена; **Stub** — маршрут есть, экран помечен «в разработке»; **—** — ещё нет.
Полная поштучная инвентаризация кнопок закрывается в D43.

## Маршруты
| Маршрут | Вкладки / окна | Данные | Действия | loading / empty / error | Задачи | Статус |
|---|---|---|---|---|---|---|
| `/demo` | вход, восстановление, reset (диалог подтверждения), панель сценариев | сессия, профиль, счета | Войти в демо, Продолжить, Reset, выбрать сценарий | спиннер «Создаём счёт…» / — / ошибка + «Повторить» | D03, D06 | Ready |
| `/finance/account` | Overview / History, активы, промокарточки, периоды | счета, остаток из журнала, котировки watchlist | переключить вкладку, период | скелетон / «Нет операций» / ErrorState | D25, D27 (сводка остатка и котировки — D05, D11) | Stub + остаток |
| `/finance/pnl` | Statistics / Profit by Market / Trading History, фильтры | сделки, PnL | фильтр, период | — | D26 | Stub |
| `/finance/verification` | Basic / Intermediate / Advanced / Business | статус KYC-демо | начать, resubmit | — | D36 | Stub |
| `/subscription` | Assistant / Analyst / Agent, сравнение | тарифы | активировать, отменить | — | D32 | Stub |
| `/activity` | Positions / Pending / History, All / AI / Client | позиции, заявки | закрыть, отменить, фильтр | — | D19 | Stub |
| `/markets` | hub рынков, Coming soon | рынки и число инструментов | открыть рынок, поиск инструмента | скелетон / — / ErrorState | D12, D42 | Ready (D12) |
| `/markets/crypto` | Charts / Performance, Order Book / Top Crypto | инструменты, котировки, свечи | выбрать актив (AssetPicker), период графика | скелетон / «Ничего не найдено» / ErrorState, «Инструмент не найден» | D12, D13, D20 | Ready: выбор+котировка+график; вкладки — D20 |
| `/markets/stocks` | Charts / Heatmap / Performance | то же | то же | то же | D12, D13, D21 | Ready: выбор+график; вкладки — D21 |
| `/markets/indices` | Charts / Heatmap / Performance, регионы | то же | то же | то же | D12, D13, D22 | Ready: выбор+график; вкладки — D22 |
| `/markets/forex` | Charts / Quotes / Performance, группы | то же | то же | то же | D12, D13, D23 | Ready: выбор+график; вкладки — D23 |
| `/markets/commodities` | Charts / Heatmap / Performance, категории | то же | то же | то же | D12, D13, D24 | Ready: выбор+график; вкладки — D24 |
| `/ventures` | locked / empty / active, funding / withdraw / history | — | — | — | D35 | Stub |
| `/ai`, `/ai/:chatId` | беседы, New, история | — | — | — | D33, D34 | Stub |
| `/settings/profile` | имя, аватар, демотелефон, Update | профиль | — | — | D37 | Stub |
| `/settings/security` | email/password, MFA/passkey (demo) | — | — | — | D38 | Stub |
| `/settings/notifications` | email/push | — | — | — | D40 | Stub |
| `/settings/language` | RU/EN, прочие preview | профиль.locale | — | — | D39 | Stub |
| `/dev/components` | витрина компонентов | — | Dialog, Tabs, Toast, формы | все состояния | D08 | Ready |
| `/dev/quotes` | тестовая карточка котировки | котировка BTC, missing price | переключить инструмент | loading / unavailable «—» / ErrorState | D10 | Ready |
| `*` | 404 | — | на главную | — | D07 | Ready |

## Глобальные элементы
| Элемент | Где | Задачи | Статус |
|---|---|---|---|
| Боковая навигация (desktop), нижняя навигация (≤ 768 px), topbar | оболочка | D07 | Ready |
| Экран «API недоступен» с «Повторить» | при сбое `/health/ready` / сети | D02 | Ready |
| Поиск, уведомления, меню аккаунта, поддержка | topbar | D07 (кнопки-заглушки), D40, D41 | Stub |
| Денежные окна deposit/receive/withdraw/swap | глобально | D28–D31 | — |
| Торговые окна Buy/Sell, TP/SL | терминал | D15–D18 | — |
| Панель демосценариев | `/demo` | D06 | Ready |

## Общие состояния
- **loading** — скелетон или спиннер с текстом действия; кнопка действия disabled с подписью «Выполняется…».
- **empty** — `EmptyState` с объяснением и следующим шагом.
- **error** — `ErrorState` с понятным текстом, `requestId` и кнопкой «Повторить». Тексты парсера/стек не показываются.
- **stale/unavailable** котировки — бейдж статуса и «—» вместо цены; ноль не подставляется.
