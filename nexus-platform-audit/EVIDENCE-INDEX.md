# Указатель материалов аудита

Основной документ — [аудит структуры](AUDIT-RU.md). План — [EasyTrade](../EASYTRADE-IMPLEMENTATION-PLAN-RU.md).

Каждый снимок состоит из PNG и JSON с текстом, кнопками, описанием полей и заголовками. Значения input, пароли, cookies и токены в JSON не собирались. Встроенный AI-чат находится в поле `frames`. Материалы относятся к авторизованному демоинтерфейсу и не предназначены для публикации как данные EasyTrade.

Ниже приведены выбранные материалы. Другие файлы в папке — промежуточные снимки обхода; их имена могут соответствовать нажатой вкладке до завершения перехода. Содержимое важнее имени файла.

| Экран | Изображение | Текст и элементы |
| --- | --- | --- |
| Финансовый кабинет | [PNG](01-finance-account.png) | [JSON](01-finance-account.json) |
| Overview | [PNG](42-finance-overview.png) | [JSON](42-finance-overview.json) |
| Подписки | [PNG](43-finance-subscription.png) | [JSON](43-finance-subscription.json) |
| Финансовая история | [PNG](44-finance-history.png) | [JSON](44-finance-history.json) |
| PnL и Profit by Market | [PNG](06-pnl-statistics.png) | [JSON](06-pnl-statistics.json) |
| История сделок в PnL | [PNG](05-trading-history.png) | [JSON](05-trading-history.json) |
| Верификация | [PNG](21-verification-settled.png) | [JSON](21-verification-settled.json) |
| Activity / Positions | [PNG](02-activity.png) | [JSON](02-activity.json) |
| Activity / Pending | [PNG](03-pending.png) | [JSON](03-pending.json) |
| Activity / History | [PNG](04-history.png) | [JSON](04-history.json) |
| Crypto / Charts и стакан | [PNG](08-charts.png) | [JSON](08-charts.json) |
| Crypto / Performance | [PNG](07-performance.png) | [JSON](07-performance.json) |
| Crypto / Top Crypto | [PNG](09-top-crypto.png) | [JSON](09-top-crypto.json) |
| Stocks / Charts | [PNG](30-stocks.png) | [JSON](30-stocks.json) |
| Stocks / Heatmap | [PNG](31-stocks-heatmap.png) | [JSON](31-stocks-heatmap.json) |
| Stocks / Performance | [PNG](32-stocks-performance.png) | [JSON](32-stocks-performance.json) |
| Indices / Charts | [PNG](33-indices.png) | [JSON](33-indices.json) |
| Indices / Heatmap | [PNG](34-indices-heatmap.png) | [JSON](34-indices-heatmap.json) |
| Indices / Performance | [PNG](35-indices-performance.png) | [JSON](35-indices-performance.json) |
| Forex / Charts | [PNG](36-forex.png) | [JSON](36-forex.json) |
| Forex / Quotes | [PNG](37-forex-quotes.png) | [JSON](37-forex-quotes.json) |
| Forex / Performance без строк | [PNG](38-forex-performance.png) | [JSON](38-forex-performance.json) |
| Commodities / Charts | [PNG](39-commodities.png) | [JSON](39-commodities.json) |
| Commodities / Heatmap | [PNG](40-commodities-heatmap.png) | [JSON](40-commodities-heatmap.json) |
| Commodities / Performance | [PNG](41-commodities-performance.png) | [JSON](41-commodities-performance.json) |
| Ventures — доступный обзор | [PNG](02-nexus-ventures.png) | [JSON](02-nexus-ventures.json) |
| Профиль | [PNG](04-profile.png) | [JSON](04-profile.json) |
| Пароль и email | [PNG](02-security.png) | [JSON](02-security.json) |
| 2FA / Passkey / Devices | [PNG](03-2fa-&-passkey.png) | [JSON](03-2fa-&-passkey.json) |
| Настройки уведомлений | [PNG](06-notifications.png) | [JSON](06-notifications.json) |
| Языки | [PNG](07-language.png) | [JSON](07-language.json) |
| Поддержка | [PNG](08-support.png) | [JSON](08-support.json) |
| Список AI-бесед | [PNG](02-chat-with-ai.png) | [JSON](02-chat-with-ai.json) |
| Существующий AI-чат | [PNG](20-ai-existing-chat.png) | [JSON](20-ai-existing-chat.json) |
| Форма входа в конце просмотра | [PNG](45-auth-overlay.png) | [JSON](45-auth-overlay.json) |

Торговые/денежные формы не открывались. Закрытые уровни KYC и продолжение Ventures не обходились. Записи транзакций в снимках существовали на момент чтения страницы; команды их создания или изменения при аудите не выполнялись.
