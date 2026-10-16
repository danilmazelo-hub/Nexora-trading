# API-контракты

Схемы — `packages/contracts/src/schemas.ts` (zod; web проверяет ими ответы). Базовый адрес API — `http://localhost:3001`;
браузер обращается через `/api/*` (Vite proxy снимает префикс). Время — ISO-8601 UTC; деньги, цены, количества —
decimal-строки; проценты — процентные пункты (`"0.97"` = 0,97 %).

## Общие правила
| Тема | Правило |
|---|---|
| Ошибка | HTTP 4xx/5xx + `{ code, message, fieldErrors?, requestId }`; коды — `ERROR_CODES` в `packages/contracts/src/errors.ts` |
| Request id | заголовок ответа `x-request-id` (входящий безопасный id переиспользуется) |
| Сессия | cookie `nexora_demo` (HttpOnly, SameSite=Lax). Защищённые маршруты без сессии → 401 `SESSION_REQUIRED`, истёкшая → 401 `SESSION_EXPIRED` |
| Владелец | только из сессии; чужой объект → 404 (`ACCOUNT_NOT_FOUND` и т.п.) |
| Идемпотентность | денежные команды принимают заголовок `Idempotency-Key`; тот же ключ + то же тело → тот же результат; другое тело → 409 `IDEMPOTENCY_CONFLICT` |
| Валидация | 400 `VALIDATION_FAILED` с `fieldErrors` |

## Health (D01–D02)
| Метод | Путь | Ответ |
|---|---|---|
| GET | `/health/live` | 200 `HealthLive` — процесс жив, БД не проверяется |
| GET | `/health/ready` | 200 `{status:"ok",checks:{database:"up"}}` или 503 `{status:"unavailable",checks:{database:"down"}}` |
