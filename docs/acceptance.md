# Критерии приёмки

Полный перечень сценариев A01–A17 и регрессий аудита — [handoff/ACCEPTANCE-AND-AUDIT-REGRESSIONS-RU.md](handoff/ACCEPTANCE-AND-AUDIT-REGRESSIONS-RU.md).
Здесь — критерии задач, реализованных в проекте, и чем они проверяются. Результаты прогонов — [QA-results.md](QA-results.md).

## Общий критерий задачи
Миграция или обоснованное переиспользование схемы; серверный контракт и отрицательные сценарии; подключённый UI
с loading/empty/error; пройденные применимые проверки; данные сохраняются; права владельца соблюдены. Если проверка
не запускалась — статус «Not run», а не Passed.

## D00–D13
| ID | Наблюдаемый результат | Проверка |
|---|---|---|
| D00 | Есть дерево правил, архитектура, модель данных, реестр экранов; ссылки рабочие | ручная, `pnpm docs:links` |
| D01 | `pnpm lint/typecheck/test/build` проходят на чистой установке; `/health/live` отвечает; стартовая страница открывается | команды |
| D02 | БД остановлена → `/health/ready` 503 `DB_UNAVAILABLE`, `/health/live` 200; после старта ready 200; данные переживают перезапуск БД | integration + ручная |
| D03 | Два браузерных контекста получают разные счета; чужой accountId → 404; истёкшая сессия → 401 и возврат на /demo | integration `session.int.test.ts`, e2e `session.spec.ts` |
| D04 | BTC, акция, индекс, Forex, товар — корректные метаданные; Live Cattle в категории `livestock`; неизвестный id → 404 `INSTRUMENT_NOT_FOUND` | integration `instruments.int.test.ts` |
| D05 | Повтор команды → одна транзакция; другой body с тем же ключом → 409; сбой между проводками откатывает всё; USD+BTC в одной сумме невозможны | unit + integration `ledger.int.test.ts` |
| D06 | Два запуска seed без дублей; reset → 50 000 только своей сессии; сценарии переключаются | integration `scenario.int.test.ts`, e2e |
| D07 | Все маршруты карты открываются напрямую, refresh/Back сохраняют маршрут, неизвестный URL → 404; незавершённые экраны помечены | e2e `navigation.spec.ts` |
| D08 | Страница `/dev/components`: Tab/Escape/возврат фокуса; disabled объяснён; ошибки API в едином формате | e2e `components.spec.ts`, integration |
| D09 | Миграции на чистой тестовой БД, FK; вход/оболочка/маршруты на 390 и 1440 px; README воспроизводим | integration, e2e screenshots |
| D10 | Один seed → одинаковые цены; карточка и API совпадают; проценты не меняют масштаб; missing price → «—» и unavailable | unit `simulator.test.ts`, `percent.test.ts`, e2e |
| D11 | Две вкладки показывают одну цену; после разрыва SSE — snapshot, нет дублей событий и лишних соединений | unit `quote-stream.test.ts`, e2e `quotes.spec.ts` |
| D12 | Поиск BTC → Bitcoin; выбор меняет URL и все блоки; рынки различаются; неизвестный symbol → «не найден» | integration + e2e `markets.spec.ts` |
| D13 | 24h и 1Y показывают разные диапазоны; нет будущих и повторяющихся свечей; смена актива меняет график | integration `candles.int.test.ts`, e2e `chart.spec.ts` |
