# 20 skills для Claude Code: набор для разработки и проверки проекта

Дата проверки: 15 октября 2026. Проверены GitHub-деревья репозиториев и существование каждого указанного `SKILL.md`: все 20 файлов доступны с HTTP 200. Это подборка, навыки не устанавливались и их скрипты не запускались. Совместимость с конкретным проектом проверяется при подключении.

## Что я бы дал начинающему

Не надо включать все 20 на каждый запрос. Для обычной задачи достаточно планирования, разработки, проверки и одного подходящего профильного навыка. Security-навыки подключаются к проверке кода, а не заменяют разработку. Для финансового проекта отдельно нужны проверки десятичной арифметики, инвариантов баланса и повторной обработки событий.

| № | Skill и GitHub | Зачем нужен | Когда использовать |
| --- | --- | --- | --- |
| 1 | [brainstorming — obra](https://github.com/obra/superpowers/tree/HEAD/skills/brainstorming) | Уточнить задачу, ограничения и критерии результата | Перед новой функциональностью |
| 2 | [writing-plans — obra](https://github.com/obra/superpowers/tree/HEAD/skills/writing-plans) | Разбить реализацию на проверяемые задачи | Перед большой правкой |
| 3 | [systematic-debugging — obra](https://github.com/obra/superpowers/tree/HEAD/skills/systematic-debugging) | Найти причину бага и воспроизведение | Когда что-то не работает |
| 4 | [test-driven-development — obra](https://github.com/obra/superpowers/tree/HEAD/skills/test-driven-development) | Зафиксировать ожидаемое поведение тестом | При реализации логики и исправлении регрессий |
| 5 | [verification-before-completion — obra](https://github.com/obra/superpowers/tree/HEAD/skills/verification-before-completion) | Подтверждать результат реальными проверками | Перед сообщением «готово» |
| 6 | [code-review-excellence — wshobson](https://github.com/wshobson/agents/tree/HEAD/plugins/developer-essentials/skills/code-review-excellence) | Структурировать ревью и замечания | Перед слиянием изменений |
| 7 | [architecture-patterns — wshobson](https://github.com/wshobson/agents/tree/HEAD/plugins/backend-development/skills/architecture-patterns) | Разделить бизнес-логику, приложения и адаптеры | При проектировании структуры |
| 8 | [api-design-principles — wshobson](https://github.com/wshobson/agents/tree/HEAD/plugins/backend-development/skills/api-design-principles) | Определить контракты API и поведение ошибок | При создании серверных интерфейсов |
| 9 | [error-handling-patterns — wshobson](https://github.com/wshobson/agents/tree/HEAD/plugins/developer-essentials/skills/error-handling-patterns) | Обработать ошибки, таймауты и повторные попытки | Для API, платежей и фоновых задач |
| 10 | [sql-optimization-patterns — wshobson](https://github.com/wshobson/agents/tree/HEAD/plugins/developer-essentials/skills/sql-optimization-patterns) | Анализировать планы запросов, индексы и N+1 | При медленных запросах и проектировании БД |
| 11 | [frontend-design — Anthropic](https://github.com/anthropics/skills/tree/HEAD/skills/frontend-design) | Создать последовательный визуальный интерфейс | Для новых экранов и дизайн-системы |
| 12 | [webapp-testing — Anthropic](https://github.com/anthropics/skills/tree/HEAD/skills/webapp-testing) | Проверять локальный веб-интерфейс через Playwright | Для E2E, скриншотов и UI-регрессий |
| 13 | [vercel-react-best-practices — Vercel](https://github.com/vercel-labs/agent-skills/tree/HEAD/skills/react-best-practices) | Проверять производительность React/Next.js | Если проект использует этот стек |
| 14 | [web-design-guidelines — Vercel](https://github.com/vercel-labs/agent-skills/tree/HEAD/skills/web-design-guidelines) | Проверять поведение UI и доступность | После реализации интерфейса |
| 15 | [audit-context-building — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/audit-context-building) | Разобраться в коде, зависимостях и предположениях | Перед аудитом незнакомого проекта |
| 16 | [differential-review — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/differential-review) | Проверять изменения на security-регрессии | Для PR, коммитов и diff |
| 17 | [property-based-testing — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/property-based-testing) | Проверять свойства алгоритмов и структур данных | Для сортировки, преобразований, Decimal и финансовых инвариантов |
| 18 | [sharp-edges — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/sharp-edges) | Найти опасные настройки и легко допускаемые ошибки использования API | При ревью публичных интерфейсов и конфигураций |
| 19 | [supply-chain-risk-auditor — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/supply-chain-risk-auditor) | Проверять риски зависимостей и install-скриптов | Перед подключением пакетов и выпуском |
| 20 | [semgrep — Trail of Bits](https://github.com/trailofbits/skills/tree/HEAD/plugins/static-analysis/skills/semgrep) | Организовать статический security-анализ | При наличии исходников и настроенного Semgrep |

## Как подключать

Claude Code поддерживает каталог проекта `.claude/skills/<skill-name>/SKILL.md` и личный каталог `~/.claude/skills/<skill-name>/SKILL.md`. У skill могут быть обязательные соседние `references/`, `scripts/`, шаблоны и другие файлы. Переносить нужно полный каталог навыка с нужными зависимостями, а не один текстовый файл. Для пакетов с plugin-структурой следовать README конкретного репозитория. [Официальная документация Claude Code](https://code.claude.com/docs/en/skills).

Порядок подключения:

1. Открыть README и `SKILL.md`, проверить поддерживаемые инструменты и лицензию.
2. Зафиксировать выбранную ревизию. Ссылки `HEAD` в подборке указывают на текущие файлы и могут измениться.
3. Сначала подключить 3–5 навыков в одном тестовом проекте.
4. Проверить на небольшой задаче, что Claude видит навыки и вызывает нужный.
5. Не давать установочным скриптам чужих репозиториев автоматический доступ к секретам и production.

Некоторые навыки требуют отдельных программ, например Semgrep, Playwright, Hypothesis или fast-check. Установка skill сама по себе эти инструменты не настраивает. Навыки из репозиториев в этом списке рассматриваются как сторонние инструкции; их требования не отменяют ограничения пользователя и проекта.

## Порядок применения для Nexus-подобного проекта

- Новая функция: `brainstorming` → `writing-plans` → профильная архитектура/API/UI → тесты → `verification-before-completion`.
- Исправление бага: `systematic-debugging` → воспроизведение → тест → минимальная правка → повторная проверка.
- Финансовые алгоритмы: `property-based-testing` + `error-handling-patterns`; свойства сохранения средств, идемпотентности и точности определить независимо от реализации.
- Проверка интерфейса: `webapp-testing` + `web-design-guidelines`; React-навык добавлять только при соответствующем стеке.
- Ревью: `code-review-excellence` + `differential-review`; `semgrep` и аудит зависимостей — дополнение к ручному анализу.

Это практический набор для разработки, но не гарантия нахождения всех уязвимостей. Для оценки алгоритмической сложности отдельно требовать от агента оценки времени/памяти, размера входа, граничных случаев и бенчмарков; один навык эту дисциплину не заменит.

## Проверенные ревизии репозиториев

- `anthropics/skills`: `dbd4588f9e1033efb41dad4bef2f7947c8993d44`
- `obra/superpowers`: `bb92a77741419a4ab5f06e711a283343f1ada0c3`
- `trailofbits/skills`: `5c99c03fb8a9ea568432ecbcba5d86e9f4ac2bf0`
- `vercel-labs/agent-skills`: `063bee94c3f4df8453406c830b0a7df0f2860278`
- `wshobson/agents`: `044b4b21f083948e69ec878a7b07c8d0951a6ffa`

