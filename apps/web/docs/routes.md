# Маршруты

- Объявлены в `src/app/routes.tsx` одним массивом (`ROUTES`), из него же строятся навигация и тесты маршрутов.
- Публичный: `/demo`. Остальные — внутри `SessionGate` (нет сессии → `/demo?next=<путь>`).
- `/` → `/markets`. Неизвестный путь → страница 404 (внутри оболочки, если есть сессия).
- Незавершённый экран рендерит `InDevelopment` с ID задачи — не считать его готовой функцией.
- Параметры: `/markets/:market?symbol=<instrumentId>&period=24h|1W|1M|1Y|All`.
- Back/forward и прямой URL работают за счёт BrowserRouter; Vite и preview отдают `index.html` на любой путь.
