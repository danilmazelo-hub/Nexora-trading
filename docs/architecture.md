# Архитектура NEXORA Trading

## Когда читать
Перед изменением границ частей, направлений импорта, формата обмена или добавлением внешней зависимости.

## Части и владельцы данных

```text
browser ──HTTP /api/* (Vite proxy) ──▶ apps/api (NestJS) ──Prisma──▶ PostgreSQL
   │                                       │
   └──SSE /api/market/stream ◀─────────────┘ (MarketDataProvider → Simulator)
```

| Часть | Владеет | Публичный интерфейс |
|---|---|---|
| `apps/api` | Все авторитетные данные: сессии, профили, счета, журнал, справочник, кеш котировок/свечей | HTTP JSON + SSE, см. [api-contracts.md](api-contracts.md) |
| `apps/web` | Только UI-состояние (вкладки, открытые диалоги, выбранный период) и кеш ответов сервера (TanStack Query) | маршруты из [screen-inventory.md](screen-inventory.md) |
| `packages/contracts` | Схемы ответов/запросов, коды ошибок, decimal/percent/format-утилиты | `@nexora/contracts` |
| PostgreSQL | Хранение; ограничения целостности (FK, unique, проверка нулевой суммы проводок) | только через Prisma в `apps/api/src/infra` |

## Направления зависимостей
- `apps/web` → `@nexora/contracts`. Запрещено: импорт из `apps/api`, `@prisma/client`, чтение серверных env.
- `apps/api` → `@nexora/contracts`, Prisma. Модули `src/modules/*` используют `src/infra` (БД) и `src/shared` (ошибки, decimal, request-id).
- `src/domain/*` (чистая логика: симулятор цен, правила журнала) не импортирует Nest, Prisma и HTTP.
- Внешние источники цен подключаются только через интерфейс `MarketDataProvider` (`apps/api/src/modules/market-data/provider.ts`).

## Поток запроса
Сервер: HTTP → middleware request-id → `SessionGuard` (cookie → DemoSession) → controller (валидация zod) →
service/use case → repository (Prisma, транзакции) → ответ или `AppError` → `ApiErrorFilter` (единый формат).

Клиент: действие → компонент → hook (`useQuery`/`useMutation`) → `apiClient` → сервер → обновление кеша → рендер.
Котировки: один `EventSource` на вкладку (`quoteStream`), подписки с подсчётом ссылок, данные пишутся в общий кеш
`['quote', instrumentId]`. Ни одна страница не хранит собственную копию цены.

## Режим и ограничения
- Этап 1 — демо: виртуальные деньги, симулятор цен, cookie-сессия без паролей. Live-интеграции — этап 2 (R01–R15).
- Единственный источник цены в демо — детерминированный симулятор (seed + clock). Котировка, свеча и будущая
  оценка позиции берутся из одного провайдера.
- Время хранится в UTC (`timestamptz`), в JSON — ISO-8601 с `Z`.

## Связанные документы
[data-model.md](data-model.md) · [api-contracts.md](api-contracts.md) · [decisions/](decisions/) · [testing.md](testing.md)
