# AGENTS.md

Этот файл дополняет корневой `/mnt/external/Project/DEV/AGENTS.md` и
содержит правила и факты, специфичные для плагина `dsh-ollama-cloud-provider`.

## Product / Purpose

- **Проект**: `dsh-ollama-cloud-provider`
- **Пакет**: `@goodandready/dsh-ollama-cloud-provider`
- **DEV**: `/mnt/external/Project/DEV/dhsplugins/dsh-ollama-cloud-provider`
- **Назначение**: LLM-провайдер для DeepSeek Harness, реализующий интеграцию с Ollama Cloud API (native и OpenAI-compatible transports, catalog, usage, analytics, multi-key rotation).
- **Основные пользователи**: Пользователи DeepSeek Harness (Web и Desktop).
- **Текущий статус**: active
- **Статус проверен**: 11.11.2026, полный прогон тестового набора 158/158 тестов, preflight PASS, работа в production web и desktop профилях.

## Package Policy (DSH-плагин)
- Все плагины проектируются публичными с первого коммита под scope `@goodandready/`.
- Имя пакета: `@goodandready/dsh-ollama-cloud-provider`.
- Публикация в GitHub/npm выполняется только после явного согласования владельца.
- Релизные `.tgz` никогда не хранятся в корне исходников — только `dist/` или `/tmp`.

## Project Index (`index.md`)
- `index.md` создан и поддерживается в актуальном состоянии.
- Навигация, команды build/test/release и архитектура описаны в `index.md`.

## Essential Files
- `docs/design/DESIGN.md` — обязательный дизайн-контракт пользовательского интерфейса и контрактов.
- `docs/deployment/DEPLOYMENT.md` — инструкции и правила сборки и деплоя.
- `deploy.sh` — штатный runner проверки и установки.
- `scripts/pack-check.mjs` — автоматический страж размера пакета и отсутствия `*.tgz` в корне.

## Правила кодовой базы
- Никаких пустых `.catch(() => {})`: использовать `bestEffortFailed(label, err)` с логированием.
- Сборка серверной библиотеки выполняется с `unbundle: true` для сохранения модульности доменов.
- Защита write-маршрутов требует обязательной проверки same-origin и loopback-сокета.
