# HTTP-клиент, запросы, ошибки

## Правило
- Все запросы — `apiClient` (`src/shared/lib/api-client.ts`): база `/api` (Vite proxy → `http://localhost:3001`),
  `credentials: 'include'`, таймаут 15 с, разбор единого формата ошибки в `ApiError { status, code, message, fieldErrors, requestId }`.
- Неожиданный ответ (HTML, не-JSON, обрыв сети) превращается в `ApiError` с кодом `NETWORK_ERROR` / `BAD_RESPONSE`;
  пользователь не видит текст парсера.
- 401 `SESSION_*` → глобальный обработчик очищает кеш и ведёт на `/demo`.
- Ключи кеша объявляются в `api.ts` модуля (`sessionKeys`, `instrumentKeys`, `quoteKeys`, `candleKeys`).

## Пример
```ts
export const instrumentKeys = { list: (q: InstrumentQuery) => ['instruments', q] as const };
export function useInstruments(q: InstrumentQuery) {
  return useQuery({ queryKey: instrumentKeys.list(q), queryFn: () => apiClient.get('/instruments', { query: q, schema: InstrumentPageSchema }) });
}
```

## Проверка результата
Unit `api-client.test.ts` (HTML-ответ, 502, таймаут); e2e — экран ошибки с «Повторить».
