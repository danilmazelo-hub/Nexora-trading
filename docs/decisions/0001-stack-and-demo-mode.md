# 0001. Стек, один backend, одна БД, деморежим

Дата: 2026-10-16. Статус: принято.

## Контекст
План требует серверное хранение уже в демо, чтобы проверять транзакции, изоляцию сессий и идемпотентность.
Пользователь поручил вести проект в существующем репозитории `nexora-trading` под брендом NEXORA Trading.

## Решение
- Монорепозиторий pnpm workspaces: `apps/api`, `apps/web`, `packages/contracts`. Один процесс backend, одна БД.
- Backend: NestJS 11 (TypeScript 5.9, CommonJS), Prisma 6.19 + PostgreSQL 18.
- Frontend: React 19 + Vite 7 + React Router 7 (library mode) + TanStack Query 5.
- Контракты: zod 3.25; decimal-арифметика: decimal.js 10 (та же библиотека, что использует Prisma `Decimal`).
- Тесты: Vitest 3 (unit/integration; для Nest — через unplugin-swc), Playwright (E2E). Lint: ESLint 9 flat + typescript-eslint 8.
- Режим: этап 1, демо. Сессия — серверная cookie без паролей; деньги виртуальные; цены — детерминированный симулятор.
- Брендинг: NEXORA Trading (логотип из прежнего демо NEXORA), а не EasyTrade.

## Версии
На 2026-10-16 в npm доступны новые мажорные версии (TypeScript 7, Nest 12, Vite 8, React Router 8, Vitest 5,
ESLint 10, Prisma 8 RC). Выбраны предыдущие стабильные линии с известной совместимостью между собой; точные
версии зафиксированы в `pnpm-lock.yaml`. Обновление на новые мажоры — отдельная задача с проверкой.
Node 24.x (проверено 24.20.0), pnpm 10.34.7 (`packageManager`).

## Последствия
- Прежний статический прототип перенесён в `legacy/nexora-demo` и не развивается.
- Документы плана перенесены в `docs/handoff` и не попадают в web-бандл.
