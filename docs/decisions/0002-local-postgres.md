# 0002. Локальный PostgreSQL: Docker Compose и embedded-режим

Дата: 2026-10-16. Статус: принято.

## Контекст
План предполагает `docker compose up -d db`. На машине разработки Docker Desktop не установлен, а его установка
требует прав администратора, WSL2 и перезагрузки.

## Решение
Поддерживаются два равноправных способа поднять **один и тот же** локальный PostgreSQL 18 (порт 5433, БД `nexora`
и отдельная тестовая БД `nexora_test`, пользователь `nexora`):

1. `docker-compose.yml` — сервис `db` (image `postgres:18`), healthcheck `pg_isready`, именованный volume
   `nexora-pgdata`, init-скрипт создаёт `nexora_test`.
2. `pnpm db:start` / `pnpm db:stop` / `pnpm db:status` — `scripts/db.mjs` на пакете `embedded-postgres`
   (официальные бинарники PostgreSQL, без прав администратора). Данные — в `.data/postgres` (вне git), сохраняются
   между перезапусками.

Приложение знает только `DATABASE_URL`; способ запуска БД ему безразличен.

## Последствия
- Каталог `.data/` в `.gitignore`.
- Пароль локальной БД — фиксированное небезопасное значение только для localhost, указано в `.env.example`.
