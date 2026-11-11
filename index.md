# index.md — @goodandready/dsh-ollama-cloud-provider

Краткая навигационная карта проекта для разработчиков и агентов.

## Назначение и текущий статус
- **Назначение**: Cordis-плагин LLM-провайдера Ollama Cloud для DeepSeek Harness.
- **Пакет**: `@goodandready/dsh-ollama-cloud-provider` (лицензия MIT).
- **Текущий статус**: `active` (версия 0.1.37).
- **Размещение**:
  - DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-ollama-cloud-provider`
  - Web Profile: `/home/vadim/.dsh/profiles/web`
  - Desktop Profile: `C:\Users\vadim\.dsh\profiles\desktop`

## Пользовательские и системные Entry Points
- Серверная часть: `src/index.ts` -> компилируется в `lib/index.js` (модульный ESM).
- Клиентская часть: `src/client/index.tsx` -> компилируется в `lib/client.js` (CJS бандл для DSH ModuleLoader).
- Маршруты API: `src/routes.ts` (`/dsh-ollama/health`, `/status`, `/state`, `/config`, `/update`, `/cooldowns/reset`).

## Основные компоненты
- `src/adapter.ts`: Реализация `LlmAdapter` с ротацией аккаунтов, кулдаунами и стримингом.
- `src/transports/`:
  - `native.ts`: Транспорт родного API `/api/chat` Ollama Cloud (NDJSON).
  - `openai-chat.ts`: OpenAI-совместимый транспорт `/v1/chat/completions` (SSE).
  - `tool-call-id.ts`: Генерация глобально уникальных ID тул-коллов (`call_${uuid}`).
- `src/catalog.ts`: Автоматический опрос, кэширование и фильтрация каталога моделей.
- `src/usage.ts`: Чтение и нормализация баланса (`/api/balance`) и расхода (`/api/usage`).
- `src/client/`: React-компоненты карточки настроек, квоты, аналитики и обновлений.

## Проверенные npm-скрипты
1. `npm run build` — сборка проекта через `tsdown` (`lib/` с `unbundle: true` и `lib/client.js`).
2. `npm run prepare` — предрелизная сборка (`tsdown 1>&2`).
3. `npm run typecheck` — проверка типов через `tsc --noEmit`.
4. `npm test` — полный запуск 36 тестовых файлов (158 тестов) через `node --test`.
5. `npm run pack:check` — проверка на отсутствие `*.tgz` в корне и соблюдение лимита размера файлов (<256 KiB).
6. `npm run check` — комплексная проверка: `typecheck && test && build && pack:check`.
7. `npm run release` — валидация и упаковка релизного артефакта в `dist/`.
8. `npm run sync:models` — синхронизация статического каталога моделей с Ollama Cloud API.

## Штатный deploy и runner
- Единый скрипт: `deploy.sh`
  - `bash deploy.sh check` — проверка и подготовка релиз-кандидата.
  - `DSH_OLLAMA_APPROVED=yes bash deploy.sh install <version>` — установка в web-профиль.
  - `bash deploy.sh verify [version]` — проверка работоспособности.

## Дата и способ последней проверки
- 11.11.2026: Прогон всех тестов (158/158 pass), `preflight.sh` (0 FAIL), проверка на стенде MiniPC и в production web-профиле.
