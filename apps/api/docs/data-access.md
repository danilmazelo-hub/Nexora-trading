# Доступ к данным, транзакции, миграции

## Когда читать
Изменение `prisma/schema.prisma`, миграций, seed, запросов с несколькими записями.

## Правило
- Подключение только через `PrismaService` (`src/infra/database/prisma.service.ts`), URL — `DATABASE_URL`.
- Несколько связанных записей — `prisma.$transaction(async (tx) => …)`; внутри используется только `tx`.
- Ограничения целостности держит БД: FK, unique, составной FK актива проводки, отложенный триггер баланса проводок
  (`prisma/migrations/*_ledger/migration.sql`). Сервис дублирует проверку для понятной ошибки, но не заменяет её.
- Время — `timestamptz(3)` UTC. Деньги — `Decimal(38,18)`.

## Порядок работы
1. Измени `schema.prisma`.
2. `pnpm db:migrate:dev --name <краткое_имя>` — создаёт миграцию и применяет к dev-БД. Ручной SQL (триггеры, CHECK)
   добавляй в созданный `migration.sql` до коммита (`--create-only`, затем `pnpm db:migrate`).
3. `pnpm db:generate` при необходимости, затем integration-тесты (они применяют миграции к `nexora_test`).

## Ошибки и границы
- Не запускай `prisma migrate reset` и `docker compose down -v` без явного решения — удаляют данные.
- Seed (`pnpm db:seed`) идемпотентен: upsert справочника и настроек, не удаляет сессии.

## Проверка результата
`pnpm test:integration` проходит на чистой тестовой БД.
