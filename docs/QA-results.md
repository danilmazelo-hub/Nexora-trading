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

## D06–D08 (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D06 | integration `scenario.int.test.ts` (5) | seed ×2 без дублей и без удаления сессий; reset требует confirm; reset → 50 000 только своей сессии, второй пользователь 50 075 без изменений; OPERATION_FAILURE → 503 и баланс не меняется | 5 passed | Passed |
| D06 | e2e `components.spec.ts › D06 reset` | UI: +$100 → reset → $50 000, второе окно $50 100; сбой операции не меняет баланс | passed (после исправления: `queryClient.clear()` отвязывал observers → заменено на `resetQueries`) | Passed |
| D07 | e2e `navigation.spec.ts` (6) | 20 маршрутов открываются напрямую и после reload; sidebar; Back/Forward; 404; «В разработке»; мобильная навигация 390 px без горизонтального скролла; /capabilities | 6 passed | Passed |
| D08 | e2e `components.spec.ts` (6) | диалог с клавиатуры, ловушка фокуса, Escape и возврат фокуса; disabled объяснён (aria-describedby); поле с label и ошибкой; вкладки стрелками; длинный текст; −<$0,01; ErrorState с requestId | 6 passed | Passed |
| D08 | integration `errors.int.test.ts` (7) | только `{code,message,fieldErrors?,requestId}`; битый JSON → 400 без текста парсера; небезопасный x-request-id заменён | 7 passed | Passed |
| D07–D08 | Скриншоты 1440/390 px (`/finance/account`) | бренд NEXORA, демо-полоса, нет чужих логотипов и обещаний доходности | корректно | Passed |

## D09–D11 (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D09 | integration `migrations.int.test.ts` (4) | все миграции применяются к пустой БД; FK владельцев и журнала, CHECK, триггеры журнала; FK отклоняет «сироту» | 4 passed | Passed |
| D09 | e2e `screens.spec.ts` (2) | /demo, оболочка и 21 маршрут на 390 и 1440 px: h1 виден, навигация видна, нет горизонтального скролла и JS-ошибок | 2 passed, скриншоты в test-results | Passed |
| D09 | Запуск по README с остановленными процессами | `pnpm install --frozen-lockfile`, `db:start`, `db:generate`, `db:migrate`, `db:seed`, `pnpm dev` → /demo 200, /health/ready 200 | так и есть (первый прогон выявил занятый порт от старого процесса — README дополнен разделом диагностики) | Passed |
| D09 | G1 | D00–D09: БД, сессия, 50 000, навигация, правила | все проверки выше | Passed (agent) |
| D10 | unit `simulator.test.ts` (8) | один seed → одинаковые цены; агрегация 5m→1h; close формирующейся свечи = цене; нет свечей из будущего; недели с понедельника UTC | 8 passed | Passed |
| D10 | integration `market-data.int.test.ts` (9, фиксированные часы) | карточка = список; проценты в п.п. без ×100; LBS unavailable с null; 404; сценарий QUOTES_UNAVAILABLE только своей сессии; кеш Quote | 9 passed | Passed |
| D10 | e2e `quotes.spec.ts` (2) | карточка: цена/источник/время/статус совпадают с API; Lumber — «—» и «Недоступно» | passed | Passed |
| D11 | integration SSE (3) | snapshot первым, монотонный seq без дублей, reconnect с Last-Event-ID → snapshot, соединения освобождаются | 3 passed | Passed |
| D11 | unit `quote-stream.test.ts` (5) | одна EventSource на все подписки; refcount; дубли/старые события отброшены; reconnect с backoff без параллельных соединений | 5 passed | Passed |
| D11 | e2e `quotes.spec.ts` (2) | Finance и /dev/quotes в двух вкладках — одинаковая цена BTC; после обрыва — одно новое соединение и продолжение обновлений | passed | Passed |
| D03 | Регрессия: быстрый клик «Войти в демо» | не возвращает на /demo | найдена гонка (ответ «нет сессии» затирал новую сессию) → исправлено `cancelQueries`; e2e ×3 = 72/72 | Passed |

## D12–D13 и финальная проверка (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D12 | e2e `markets.spec.ts` (7) | hub: 5 рынков со счётчиками, Coming soon недоступны; поиск BTC → Bitcoin, выбор меняет URL, заголовок, котировку и график; Back; рынки различаются; неизвестный symbol → «не найден» без автоподстановки; символ чужого рынка → ссылка; пусто → empty state; поиск в topbar | 7 passed | Passed |
| D12 | integration `instruments.int.test.ts` | поиск/сортировка/пагинация справочника | passed | Passed |
| D13 | integration `market-data.int.test.ts` (свечи) | упорядочены, без дублей, без будущих, последняя формирующаяся, шаг = интервал; 24h vs 1Y разные диапазоны; truncated; from>to → 400; лимит; кеш Candle | passed | Passed |
| D13 | integration `migrations.int.test.ts` | индекс (instrumentId, interval, openTime DESC); `SHOW timezone` = UTC | passed | Passed |
| D13 | e2e `chart.spec.ts` (6) | canvas с >200 свечами за 24h; 24h ≤ 24 ч, 1Y > 300 дней, период в URL и после reload; 1W/1M/All — свои интервалы; без будущих/повторов; смена актива заменяет график; LBS — «Нет данных»; формат цены по tickSize | 6 passed | Passed |
| D13 | Лицензия библиотеки | Apache-2.0, атрибуция и ссылка на tradingview.com | ADR 0004, подпись под графиком, THIRD-PARTY-NOTICES.md | Passed |
| Регрессия | Холодный старт + e2e | без 500 при создании сессии | найдено P2028 (localhost → IPv6 и ожидание соединения) → адреса 127.0.0.1, maxWait 10 с, уступка event loop при расчёте свечей | Passed |
| Финал | `pnpm lint`, `typecheck`, `test`, `build`, `test:integration`, `test:e2e`, `docs:links` | всё зелёное | 0 lint; 43 unit; 64 integration; 37 e2e; build без предупреждений; 0 битых ссылок | Passed |
| Финал | Скриншоты `/markets/crypto?symbol=BTC-USD&period=1M` (1440), `/markets/forex?symbol=EUR-USD` (390) | график, котировка, параметры, без горизонтального скролла | корректно | Passed |

## D10+ Живые справочные цены (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D10+ | unit `live/feeds.test.ts` (13) | Binance: кеш 24h-тикера с реальными bid/ask, без данных → null (не 0), устаревание → stale, только USD-крипта, klines в диапазоне, ошибка истории → null. Twelve Data: single/batch ответы, приоритет открытой пары, остальные из кеша без трат, лимит в минуту не превышается, 429 → пауза, ключ не попадает в usage, кеш истории, даты UTC | 13 passed | Passed |
| D10+ | Живой вызов API (dev, ключ в apps/api/.env) | BTC-USD `binance` `live`, EUR-USD `twelvedata` `delayed`, AAPL `simulator`; стакан BTC; свечи 5m/1w BTC с 2022-01-03, 1h EUR/USD; повторный запрос свечей из кеша | так и есть; Twelve Data: 2 кредита из 800 | Passed |
| D10+ | integration (64) с `MARKET_LIVE_FEEDS=off` | детерминированный симулятор без сети | 64 passed | Passed |
| D10+ | e2e (38) при включённых feeds | прежние сценарии + стакан на /markets/crypto, нет стакана на акциях | 38 passed | Passed |
| D10+ | Скриншоты /markets/crypto и /markets/forex (1440) | бейдж «Реальные цены Binance / Twelve Data · сделки демо», источник в карточке, параметрах и под графиком, стакан | корректно | Passed |

## D08+ Иконки инструментов (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D08+ | Покрытие | иконка у каждого не-Forex инструмента, флаги у всех валют Forex | 141/141 иконок, 0 недостающих флагов | Passed |
| D08+ | Скриншоты /markets/crypto, /markets/forex, /markets/stocks, /finance/account (1440) | иконки в списке, заголовке, карточке; два флага у пар; нет битых картинок и 4xx | корректно; найден и исправлен перенос символа в узких карточках watchlist | Passed |
| D10+ | Регрессия: «Устарела» у BTC/ETH сразу после простоя | свежая цена при первом открытии | исправлено: опрос Binance возобновляется сразу, устаревший кеш сначала обновляется | Passed |

## D10+ Акции и драгметаллы через Twelve Data (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D10+ | unit `live/feeds.test.ts` (+2) | акции и XAU/XAG/XPT/XPD сопоставлены, нефть — нет; отказ тарифа (403) → инструмент на симуляторе, не пауза лимита | 15 passed | Passed |
| D10+ | Покрытие тарифа Basic: 49 акций + 4 металла через API (8 кредитов/мин) | реальные цены где доступно, отказ → симулятор | 49/49 акций и XAU/USD — `twelvedata delayed` (AAPL 343.73, XAU 4185.20); XAG/XPT/XPD отклонены тарифом → `simulator`; 64 кредита за прогон, лимит в минуту не превышен сервером | Passed |

## D10+ Индексы EOD (Massive) и энергоносители (EIA) (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D10+ | unit `live/eod-feeds.test.ts` (7) | EIA: дневные свечи закрываются ровно по закрытиям EIA, уровень реальный, без истории → null; Massive: котировка = закрытие сессии, статус eod, свечи 1d/1w, внутридневные пустые, NOT_AUTHORIZED → симулятор и повтор через 30 мин | 7 passed | Passed |
| D10+ | Живой API | WTI `eia-sim` 99.34, закрытие 14.10 = 101.91 (EIA); Brent, газ, бензин, мазут — eia-sim; кукуруза — simulator; NDX `massive eod` 29935.59; SPX — план не даёт → simulator; GDAXI — simulator | так и есть | Passed |
| D10+ | Регрессия: ширина дневных свечей EIA | правдоподобный диапазон | найдено ±7 %/день из-за масштабирования high/low крайними коэффициентами → масштаб середины свечи, 3–5 % | Passed |
| D10+ | Скриншоты /markets/commodities?symbol=USOIL, /markets/indices?symbol=NDX (1Y и 24h) | бейджи источника, «По итогам дня», дата сессии, годовой график | корректно | Passed |

## D02 Регрессия: окна консоли на Windows (2026-10-16)
| ID | Проверка | Ожидание | Факт | Статус |
|---|---|---|---|---|
| D02 | `pnpm db:stop` + `pnpm db:start`, затем 64 integration-теста | ни одного окна консоли у процессов PostgreSQL | было: новое окно на каждое подключение (`detached` = процесс без консоли); стало: одна скрытая консоль через `Start-Process -WindowStyle Hidden`, запуск 2,2 с, 0 видимых окон после тестов, 64 passed | Passed |
| D02+ | Прототип `legacy/nexora-demo`: порядок источников | Twelve Data основной для акций/металлов; «отдаёт данные» у каждого провайдера, отдававшего цены за 3 мин | так и есть | Passed |
