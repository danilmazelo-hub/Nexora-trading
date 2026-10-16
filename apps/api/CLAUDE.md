# Правила backend (apps/api)

## Область
Каталог `apps/api`. Дополнительно действуют [корневые правила](../../CLAUDE.md).

## Структура
```text
src/
├── main.ts, app.module.ts        bootstrap, глобальные фильтр/middleware
├── config/env.ts                 проверка обязательных переменных (zod), падение при старте с понятным текстом
├── infra/database/               PrismaService, транзакции
├── shared/                       AppError + ApiErrorFilter, request-id, decimal, zod-pipe
├── domain/                       чистая логика без Nest/Prisma: market-sim, ledger-rules
└── modules/<feature>/            controller → service → Prisma; index по необходимости
prisma/schema.prisma, prisma/migrations/, prisma/seed.ts, prisma/catalog.ts
test/*.int.test.ts                integration на nexora_test
```

## Обязанности слоёв
- Controller: разбор и валидация входа (zod через `ZodPipe`), вызов сервиса, без бизнес-логики.
- Service: бизнес-правила, проверка владельца объекта, транзакции.
- `domain/*`: детерминированные функции (симулятор, проверка проводок); покрываются unit-тестами.

## Обязательные свойства
- Владелец — только из `req.demoSession` (`SessionGuard`). Чужой объект → 404 (не раскрываем существование).
- Деньги — `Prisma.Decimal`/`decimal.js`, в ответах — строки. `number` для денег запрещён.
- Ошибки — только через `AppError(code, status, message, fieldErrors?)`; неизвестные ошибки → `INTERNAL_ERROR` без деталей.
- Журнал append-only; связанные записи — в одной `prisma.$transaction`.
- Изменение схемы = новая именованная миграция в `prisma/migrations` (`pnpm db:migrate:dev --name <name>`).

## Тематические документы
| Когда читать | Документ |
|---|---|
| Меняешь хранение, транзакции, миграции | [docs/data-access.md](docs/data-access.md) |
| Сессии и владельцы | [docs/auth.md](docs/auth.md) |
| Журнал денег, симулятор цен | [docs/business-logic.md](docs/business-logic.md) |
| Endpoint или DTO | [../../docs/api-contracts.md](../../docs/api-contracts.md) |
| Тесты | [../../docs/testing.md](../../docs/testing.md) |

## Проверки
`pnpm --filter @nexora/api lint`, `typecheck`, `test`, `test:integration` (нужна БД).
