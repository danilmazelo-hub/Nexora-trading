# Правила frontend (apps/web)

## Область
Каталог `apps/web`. Дополнительно действуют [корневые правила](../../CLAUDE.md).

## Структура
```text
src/
├── main.tsx                  точка входа
├── app/                      router, providers, Shell (sidebar/bottom nav/topbar), брендинг
├── pages/                    композиция модулей в экраны (по маршрутам из docs/screen-inventory.md)
├── modules/<feature>/        api.ts (запросы и ключи кеша), hooks, components, index.ts
├── shared/ui/                базовые компоненты (Button, Field, Select, Dialog, Tabs, Table, EmptyState, ErrorState, Toast…)
├── shared/lib/               apiClient, format (деньги/проценты), i18n
├── locales/                  ru.ts, en.ts
└── styles/                   tokens.css (цвета/размеры), global.css
```

## Зависимости
- Компоненты получают данные через hooks модулей; `fetch` напрямую — только в `shared/lib/api-client.ts`.
- Общие модули (`shared/*`) не импортируют `modules/*`. Модули импортируют друг друга только через `index.ts`.
- `@nexora/contracts` — схемы ответов и форматтеры. Код `apps/api` не импортировать.

## Поведение интерфейса
- Каждый запрос: loading / empty / success / error (`ErrorState` с requestId и «Повторить»).
- После mutation — инвалидировать или обновить соответствующие ключи кеша; после reset — `queryClient.clear()`.
- Денежные значения не вычисляются в UI из чисел: показывается decimal-строка сервера через `formatMoney`.
- Котировки — только из общего кеша `['quote', id]`, наполняемого `quoteStream`.
- Поля с `<label>`; диалоги закрываются Escape и возвращают фокус; disabled-кнопки объясняют причину.

## Тематические документы
| Когда читать | Документ |
|---|---|
| Запросы, ключи кеша, ошибки | [docs/api.md](docs/api.md) |
| Где живёт состояние | [docs/state.md](docs/state.md) |
| Компоненты и доступность | [docs/components.md](docs/components.md) |
| Маршруты | [docs/routes.md](docs/routes.md) |
| Тесты | [../../docs/testing.md](../../docs/testing.md) |

## Проверки
`pnpm --filter @nexora/web lint`, `typecheck`, `test`, затем `pnpm test:e2e`.
