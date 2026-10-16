# NEXORA Trading — демо-платформа

Демонстрационная торговая платформа: собственная демосессия со счётом $50 000 в виртуальных средствах, справочник
инструментов пяти рынков, детерминированные котировки, живое обновление цен и интерактивные свечные графики.
**Реальных денег, платежей и брокерского исполнения нет.** Правила проекта — [CLAUDE.md](CLAUDE.md), план —
[docs/handoff/EASYTRADE-IMPLEMENTATION-PLAN-RU.md](docs/handoff/EASYTRADE-IMPLEMENTATION-PLAN-RU.md), прогресс — [docs/progress.md](docs/progress.md).

## Требования
| Инструмент | Версия | Проверка |
|---|---|---|
| Node.js | 24.x (проверено 24.20.0) | `node --version` |
| pnpm | 10.34.7 (поле `packageManager`) | `pnpm --version`; установка: `npm install -g pnpm@10.34.7` |
| Git | любой актуальный | `git --version` |
| PostgreSQL 18 | одно из: встроенный (`pnpm db:start`, ничего ставить не нужно) **или** Docker Desktop (`docker compose`) | — |

## Первый запуск (Windows PowerShell; в bash команды те же)
```powershell
pnpm install --frozen-lockfile
# конфиги — только если их ещё нет (существующие не перезаписывать)
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (-not (Test-Path apps/web/.env)) { Copy-Item apps/web/.env.example apps/web/.env }

pnpm db:start          # локальный PostgreSQL на localhost:5433 (БД nexora и nexora_test), данные в .data/postgres
#   или вместо этого:  docker compose up -d db ; docker compose ps
pnpm db:generate       # Prisma Client
pnpm db:migrate        # применить сохранённые миграции к dev-БД
pnpm db:seed           # справочник инструментов и настройки рынка (идемпотентно, можно запускать повторно)
pnpm dev               # contracts (watch) + API + web
```

Адреса:
- web: **http://localhost:5173/demo**
- API liveness: http://localhost:3001/health/live
- API readiness (с проверкой БД): http://localhost:3001/health/ready

Frontend обращается к `/api/*` через dev-proxy Vite; сессия — серверная HttpOnly cookie. Ключей внешних API не нужно.

## Команды
| Команда | Что делает | Изменяет данные? |
|---|---|---|
| `pnpm dev` / `pnpm dev:api` / `pnpm dev:web` | запуск всего / только API / только web | нет |
| `pnpm lint` | ESLint без автоисправления | нет |
| `pnpm typecheck` | tsc для contracts/api/web | нет |
| `pnpm test` | unit-тесты (однократно) | нет |
| `pnpm test:integration` | integration на **тестовой** БД `nexora_test` (нужен `pnpm db:start`) | очищает только `nexora_test` |
| `pnpm test:e2e` | Playwright E2E (Chromium; сам поднимает API и web, если не запущены) | создаёт демосессии в dev-БД |
| `pnpm build` | сборка contracts, api, web | нет |
| `pnpm db:start` / `db:stop` / `db:status` | встроенный PostgreSQL | stop сохраняет данные |
| `pnpm db:generate` | генерация Prisma Client | нет |
| `pnpm db:migrate` | применить сохранённые миграции | схема dev-БД |
| `pnpm db:migrate:dev --name <имя>` | создать новую миграцию (только при изменении схемы) | схема dev-БД |
| `pnpm db:seed` | upsert справочника и настроек; сессии не трогает | да, идемпотентно |
| `pnpm docs:links` | проверка относительных ссылок в документации | нет |

Не выполняйте `docker compose down -v` и `prisma migrate reset` без необходимости — они удаляют данные.
Для сброса демо используйте кнопку «Сбросить демосчёт» на `/demo` (сбрасывает только вашу сессию).

## Остановка
`Ctrl+C` в терминале `pnpm dev`; затем `pnpm db:stop` (или `docker compose stop db`). Данные сохраняются.

## Структура
```text
apps/api            NestJS API (Prisma, PostgreSQL) — правила: apps/api/CLAUDE.md
apps/web            React + Vite SPA — правила: apps/web/CLAUDE.md
packages/contracts  общие схемы, коды ошибок, decimal/percent/format
scripts/            db.mjs (встроенный PostgreSQL), check-links.mjs, docker-init/
tests/e2e           Playwright
docs/               architecture, data-model, api-contracts, acceptance, screen-inventory, decisions, progress, QA-results
docs/handoff        исходный пакет плана и аудиты (только справка)
legacy/nexora-demo  прежний статический прототип (не развивается)
```

## Диагностика
| Симптом | Действие |
|---|---|
| Экран «API недоступен» | API не запущен: `pnpm dev` (или `pnpm dev:api`) |
| Экран «База данных недоступна», `/health/ready` = 503 | `pnpm db:start` или `docker compose up -d db`; экран восстановится сам |
| API не стартует: «Некорректная конфигурация окружения» | создайте `apps/api/.env` из `.env.example`; сообщение называет переменную |
| Порт 5173/3001/5433 занят | найдите свой процесс (`netstat -ano | findstr :5173`) и завершите его |
| `pnpm db:start` на Windows и путь с кириллицей | скрипт сам использует короткий 8.3-путь; если 8.3-имена отключены — используйте Docker |
