# Компоненты и доступность

## Базовые компоненты (`src/shared/ui`)
`Button` (variant, loading, `disabledReason` → видимая подсказка + `aria-describedby`), `Field` (label + input/select +
hint + error с `aria-invalid`), `Select`, `Dialog` (портал, ловушка фокуса, Escape, возврат фокуса на вызвавший элемент),
`Tabs` (роль tablist, стрелки ←/→, Home/End), `Table` (заголовки `th scope`, режим карточек на мобильном),
`EmptyState`, `ErrorState` (requestId + «Повторить»), `Toast` (`role="status"`, авто-скрытие), `Spinner`, `Badge`, `Money`.

## Правила
- Placeholder не заменяет подпись. Иконочные кнопки имеют `aria-label`.
- Длинный текст переносится (`overflow-wrap: anywhere`), таблицы прокручиваются в своём контейнере.
- Фокус виден (`:focus-visible` кольцо токена `--focus`).
- Витрина: `/dev/components`.
