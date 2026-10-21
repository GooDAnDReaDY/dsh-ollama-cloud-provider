# 📦 @goodandready/dsh-ollama-cloud-provider

Провайдер **Ollama Cloud** для DeepSeek Harness (dsh).

Плагин регистрирует один маршрут `ollama-cloud` (`https://ollama.com`) и два протокола:

| Транспорт | Endpoint | Когда используется |
|---|---|---|
| `native` (по умолчанию) | `POST /api/chat` | thinking, вызовы инструментов, счётчики usage |
| `openai-chat` | `POST /v1/chat/completions` | OpenAI-совместимые развёртывания и запасной путь |

Ключ разрешается на каждый запрос, поэтому смена credential применяется без перезапуска.

## Возможности

- Два транспорта, выбираемые по модели.
- Текст, reasoning/thinking, tool calls, изображения, usage и finish reasons.
- Живой каталог из `GET /v1/models`, дополненный `capabilities` из `GET /api/tags`.
- Точные метаданные для picker: контекст, модальности, уровни reasoning и уровень по умолчанию, поддержка инструментов, видимость в API.
- Баланс и расход из официальных `/api/balance` и `/api/usage`: включённые и купленные кредиты, расход за 24 часа / 7 дней / 30 дней, расход по моделям.
- Мультиаккаунт с ротацией **до первого токена** на 401/403/429 и исчерпанную квоту; cooldown'ы сохраняются между перезапусками.
- Липкий аккаунт на диалог и правила `модель → аккаунт` по glob.
- Оценка стоимости по published-тарифу Ollama, включая off-peak, с ручными overrides.
- UI: страница **Настройки → Ollama Cloud**, карточка квоты в сайдбаре (по умолчанию выключена и не опрашивает `/state`, пока выключена), панель с расходом, аналитикой и heatmap.
- Команда `/ollama`, секция TUI и обновление плагина в один клик.

## Установка

```bash
npm install
npm run build
npm pack
dsh plugin --profile web add /absolute/path/to/goodandready-dsh-ollama-cloud-provider-0.1.0.tgz
# DSH Desktop:
dsh plugin --profile desktop add /absolute/path/to/goodandready-dsh-ollama-cloud-provider-0.1.0.tgz
```

После установки перезапустите dsh и выберите **Ollama Cloud** в списке моделей.

## Настройка

```yaml
- id: llm-ollama-cloud
  name: "@goodandready/dsh-ollama-cloud-provider"
  config:
    apiKeyEnv: OLLAMA_API_KEY
    transport: native            # native | openai-chat
    requestTimeoutMs: 300000
    streamIdleTimeoutMs: 300000
    visibleModels: []
    accounts:
      - label: Work
        apiKeyEnv: OLLAMA_API_KEY_2
    activeAccount: ''
    stickySession: true
    showSidebarQuota: false
```

Все поля, кроме `apiKey`, доступны в настройках DSH.

### Ключи

1. `config.apiKey` — только в composition, `role('secret')`.
2. Credential-сервис по имени `apiKeyEnv` (по умолчанию `OLLAMA_API_KEY`).
3. Переменные окружения запуска.

Ключ создаётся на <https://ollama.com/settings/keys>, не истекает. Принимается только `Authorization: Bearer`; `x-api-key` cloud отклоняет.

### Аккаунты и ротация

Дополнительный аккаунт добавляется в **Настройки → Ollama Cloud → Аккаунты**: имя + ссылка на credential (например `OLLAMA_API_KEY_2`), затем ключ и «Сохранить». Ротация происходит до стриминга: отклонённый ключ получает cooldown, запрос повторяется следующим ключом. Cooldown'ы лежат в `~/.dsh/storages/dsh-ollama/cooldowns.json` и хранятся по SHA-256 fingerprint — сырые ключи не пишутся.

### Правила модель → аккаунт

```yaml
modelAccountRules:
  - pattern: "*flash*"
    account: "Work"
```

Первый совпавший glob ставит аккаунт первым; остальные остаются fallback.

## Баланс и расход

- `GET /api/balance` — новый формат (`included.balance_usd`, `allowance_usd`, `period`, `purchased.balance_usd`) и legacy-формат (`session` / `weekly` с `remaining_percent`). Поддерживаются оба.
- `GET /api/usage?range=24h|7d|30d&group_by=model` — totals и группы по моделям.

У `/api/usage` лимит **10 запросов в минуту на пользователя**, поэтому баланс кэшируется на 60 с, usage — на 120 с, ошибки — на 30 с. Фонового опроса нет. Недоступность квот не блокирует чат.

## Команда

```
/ollama status
/ollama usage
/ollama balance
/ollama accounts
/ollama models
/ollama rules
/ollama test [model]
```

## Проверенные факты API (2026-10-21)

- `GET https://ollama.com/v1/models` публичный и, кроме стандартного `data[]`, отдаёт нестандартный `models[]` с контекстом, модальностями, уровнями reasoning, `visibility` и `supported_in_api`.
- `GET https://ollama.com/api/tags` публичный и единственный источник `capabilities` по моделям.
- Live-каталог вернул 23 облачные модели.
- Нативный `/api/chat` — NDJSON, счётчики и `done_reason` в финальной строке.
- OpenAI `/v1/chat/completions` поддерживает стриминг, tools, vision, `reasoning_effort` и `include_usage`.
- Anthropic-совместимость (`/v1/messages`) частичная и плагином не используется.

## Разработка

```bash
npm run typecheck
npm test
npm run build
npm run check
node scripts/probe.mjs
```

## Ограничения

- Только Ollama Cloud; локальный `http://localhost:11434` не регистрируется.
- Embeddings не поддерживаются: ни одна облачная модель не объявляет capability `embedding`.
- Файловые вложения передаются текстовыми handle-заглушками, не байтами.
- Стоимость — оценка по опубликованному тарифу; финальным авторитетом остаётся gateway.
- UI требует web-профиль; в TUI остаются команда `/ollama` и маршрут модели.

## Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY). См. [LICENSE](./LICENSE) и [NOTICE](./NOTICE).
