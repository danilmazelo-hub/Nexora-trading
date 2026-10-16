# Правила проекта NEXORA Trading

## Назначение
NEXORA Trading — демонстрационная торговая платформа (крипта, акции, индексы, Forex, сырьё) с виртуальными
средствами. Пользователь входит в собственную демосессию со счётом $50 000, смотрит рынки и котировки,
работает с графиками, позже — совершает виртуальные сделки. Реальных денег, платежей, KYC и брокерского
исполнения в этапе 1 нет. План работ: [docs/handoff/EASYTRADE-IMPLEMENTATION-PLAN-RU.md](docs/handoff/EASYTRADE-IMPLEMENTATION-PLAN-RU.md)
(бренд EasyTrade из плана в интерфейсе заменён на NEXORA Trading).

## Карта проекта
| Часть | Путь | Ответственность | Правила |
|---|---|---|---|
| Backend (API) | `apps/api` | NestJS модульный монолит: сессии, справочник, журнал денег, рыночные данные | [apps/api/CLAUDE.md](apps/api/CLAUDE.md) |
| Frontend (web) | `apps/web` | React SPA: маршруты, оболочка, экраны, клиентский кеш | [apps/web/CLAUDE.md](apps/web/CLAUDE.md) |
| Контракты | `packages/contracts` | Общие схемы (zod), DTO, коды ошибок, decimal/percent-утилиты | этот файл + [docs/architecture.md](docs/architecture.md) |
| Локальная БД | `scripts/db.mjs`, `docker-compose.yml` | PostgreSQL для dev и отдельная тестовая БД | [docs/decisions/0002-local-postgres.md](docs/decisions/0002-local-postgres.md) |
| E2E | `tests/e2e` | Сквозные сценарии Playwright | [docs/testing.md](docs/testing.md) |
| Старое демо | `legacy/nexora-demo` | Прежний статический прототип, только справка; не развивается | — |
| Пакет плана | `docs/handoff` | План, приёмка, аудиты-референсы. Не публиковать в web-бандл | — |

## Архитектурные границы
- Один backend, одна БД (PostgreSQL), деморежим. Микросервисы и очереди не добавлять. Внешние источники — только
  справочные цены через `MarketDataProvider`/live-feeds ([ADR 0005](docs/decisions/0005-live-reference-feeds.md)); брокерское
  исполнение, платежи и KYC — этап 2.
- `apps/web` не импортирует код `apps/api`, Prisma и серверные секреты; общий код — только через `@nexora/contracts`.
- `packages/contracts` не зависит от приложений.
- Деньги и количества: `Decimal` на сервере (numeric в БД), decimal-строки в JSON. Тип `number` для итоговой финансовой арифметики не использовать.
- Владелец данных определяется серверной сессией (cookie), а не переданным из браузера id.

## Общие требования
- Ошибки API — единый формат `{ code, message, fieldErrors?, requestId }` без внутренних деталей.
- Секреты не коммитятся: только `.env.example` с именами переменных и безопасными локальными значениями.
- Каждый запрос к данным в UI имеет loading/empty/error. Поля имеют подписи, диалоги закрываются Escape с возвратом фокуса.
- Нет обещаний доходности, чужих логотипов и реальных реквизитов; всё помечено «Демо».

## Источники истины
| Что | Где |
|---|---|
| Схема БД и миграции | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/` |
| HTTP-контракты | [docs/api-contracts.md](docs/api-contracts.md) + `packages/contracts/src` |
| Модель данных и инварианты | [docs/data-model.md](docs/data-model.md) |
| Экраны и действия | [docs/screen-inventory.md](docs/screen-inventory.md) |
| Критерии приёмки | [docs/acceptance.md](docs/acceptance.md) |
| Версии и команды | `package.json` (packageManager, scripts), [README.md](README.md) |
| Решения | [docs/decisions/](docs/decisions/) |

## Рабочий процесс
Прочитать правила затронутых частей → определить результат и критерии задачи (Dxx) → БД → backend → frontend →
проверки (lint, typecheck, test, integration, e2e по риску) → обновить документы → commit с ID задачи.
Задачи выполняются по порядку плана; прогресс — [docs/progress.md](docs/progress.md), результаты проверок — [docs/QA-results.md](docs/QA-results.md).

## Проверки
| Команда | Когда |
|---|---|
| `pnpm lint` | любые изменения кода |
| `pnpm typecheck` | любые изменения кода |
| `pnpm test` | unit-тесты, всегда |
| `pnpm test:integration` | изменения БД, сессий, ledger, API (нужна запущенная БД: `pnpm db:start`) |
| `pnpm test:e2e` | изменения маршрутов, UI-сценариев (нужны запущенные `pnpm dev`) |
| `pnpm build` | перед commit крупных изменений |

## Навигация по документации
| Задача | Документ |
|---|---|
| Сервер, БД, миграции | [apps/api/CLAUDE.md](apps/api/CLAUDE.md) |
| Интерфейс | [apps/web/CLAUDE.md](apps/web/CLAUDE.md) |
| Границы и зависимости | [docs/architecture.md](docs/architecture.md) |
| Сущности и деньги | [docs/data-model.md](docs/data-model.md) |
| Endpoint или DTO | [docs/api-contracts.md](docs/api-contracts.md) |
| Определение результата | [docs/acceptance.md](docs/acceptance.md) |
| Тесты и окружения | [docs/testing.md](docs/testing.md) |
| Запуск | [README.md](README.md) |
