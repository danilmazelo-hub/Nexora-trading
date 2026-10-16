# Демосессии и владельцы

## Когда читать
Изменение `modules/session`, guard, cookie, любых endpoint с данными пользователя.

## Правило
- `POST /demo/session` создаёт сессию (или возвращает текущую, если cookie действительна). Токен — 32 случайных
  байта (base64url) в cookie `nexora_demo` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` при `COOKIE_SECURE=true`).
  В БД хранится только `sha256(token)`.
- Срок жизни — `SESSION_TTL_HOURS` (по умолчанию 168), продлевается при активности не чаще раза в минуту.
- `SessionGuard` на защищённых маршрутах: нет cookie / неизвестна / истекла / отозвана → 401 `SESSION_REQUIRED`
  или `SESSION_EXPIRED`. Клиент при 401 переводит на `/demo`.
- Объекты (счёт и т.п.) ищутся по `id` **и** `sessionId` текущей сессии. Нет совпадения → 404, независимо от
  существования объекта у другого владельца.

## Отрицательные сценарии (integration)
Чужой accountId → 404; истёкшая сессия → 401 `SESSION_EXPIRED`; без cookie → 401 `SESSION_REQUIRED`.
