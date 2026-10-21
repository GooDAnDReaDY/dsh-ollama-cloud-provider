# dsh-ollama-cloud-provider — архитектура

Плагин DeepSeek Harness, регистрирующий маршрут `ollama-cloud` (`https://ollama.com`) с двумя протоколами: нативный `/api/chat` (по умолчанию) и OpenAI-совместимый `/v1/chat/completions`.

## 1. Решения

| Вопрос | Решение | Причина |
|---|---|---|
| Маршруты | только `ollama-cloud` | локальный сервер не входит в задачу |
| Транспорт по умолчанию | `native` | документированные `message.thinking`, счётчики `prompt_eval_count`/`eval_count`, полный набор tool calls |
| Второй транспорт | `openai-chat` | совместимость и запасной путь; поле reasoning не документировано — парсятся три варианта |
| Каталог | live `/v1/models` + `/api/tags` | live точнее models.dev; tags — единственный источник capabilities |
| Квоты | `/api/balance` + `/api/usage` | официальные документированные endpoint'ы |
| UI | settings-страница, sidebar-карточка, панель | паритет с dsh-opencode-provider и dsh-commandcode-provider |

## 2. Модули

```
src/
  index.ts            name/inject/Config/apply, регистрация провайдера
  config.ts           schemastery Config, volatile-поля, resolveConfig
  adapter.ts          OllamaCloudAdapter: ротация, cooldown, sticky, routing trace
  catalog.ts          live-каталог, объединение с tags, effectiveModel, picker sort
  models.generated.ts офлайн-снимок каталога и цен
  pricing.ts          цена по id/base-тегу, off-peak, estimateCost
  routing.ts          URL каталога, tags, show и чата для двух транспортов
  messages.ts         DSH messages → native и OpenAI body
  transports/
    ndjson.ts         построчное чтение NDJSON с idle-timeout и abort
    native.ts         парсер /api/chat
    sse.ts            общий SSE
    openai-chat.ts    парсер /v1/chat/completions
  credentials.ts      literal → credentials → launch env; слоты аккаунтов
  account-rules.ts    glob model→account
  errors.ts           классификация HTTP/тела/стрима
  usage.ts            balance + usage, нормализация, кэш, скользящий лимит
  quota-model.ts      единая модель окон для UI и команд
  analytics.ts        локальный проекционный кэш, фильтр провайдера
  request-log.ts      requests.jsonl + heatmap, без текстов и ключей
  routes.ts           /dsh-ollama/*, loopback/same-origin guard
  routes-public.ts    state без секретов
  routes-values.ts    санитайзеры patch
  commands.ts         /ollama
  tui-settings.ts     секция TUI
  plugin-updater.ts   общий self-updater
  client/             settings-страница, sidebar, панель, аналитика, heatmap
```

## 3. Поток запроса

1. Снимок конфига; транспорт = `modelTransports[model] ?? transport`.
2. Ключи: `modelAccountRules` → `activeAccount` → sticky → первый не в cooldown.
3. Изображения через `ctx.attachments`, ограничение tool-списка, нормализация схем.
4. Сборка тела: `buildNativeBody` или `buildChatBody`.
5. Отправка с `attributionHeaders()`, `Authorization: Bearer`, `User-Agent`, `Accept`; header-timeout.
6. Ротация до первого чанка по 401/402/403/429/5xx; после старта поток не переигрывается.
7. Парсер отдаёт `StreamChunk`: block-start/delta/block-end, usage перед finish.
8. Попытка пишется в `requests.jsonl`; routing trace хранит последние 20 решений.

## 4. Каталог

`GET /v1/models` (публичный) возвращает стандартный `data[]` и нестандартный `models[]`:

- `slug`, `display_name`
- `context_window`, `max_context_window`
- `input_modalities`
- `supported_reasoning_levels[{effort, description}]`, `default_reasoning_level`
- `visibility`, `supported_in_api`

`GET /api/tags` добавляет `capabilities` (`completion`, `tools`, `thinking`, `vision`, `decision`).

Правила объединения:

- live-модель побеждает снимок по контексту, уровням reasoning и модальностям;
- цена и `maxTokens` берутся из снимка (live их не отдаёт);
- `filterModelsByPlan` скрывает `visibility === 'hide'` и `supported_in_api === false`;
- при недоступности сети остаётся снимок `models.generated.ts`.

## 5. Квоты

`GET /api/balance`:

- новый формат: `included.balance_usd`, `included.allowance_usd`, `included.period`, `purchased.balance_usd`;
- legacy: `included.session.remaining_percent`, `included.weekly.remaining_percent` + `resets_at`.

`GET /api/usage?range=24h|7d|30d&group_by=model`:

- `totals{request_count,usage_usd,input_tokens,cached_input_tokens,output_tokens}`;
- `buckets[]` и `groups[]`.

Лимит endpoint'а — 10 запросов/мин на пользователя. Реализация: кэш balance 60 с, usage 120 с, failure 30 с, скользящее окно 9 вызовов за 60 с. Fail-open.

## 6. Ошибки

| Условие | Код |
|---|---|
| нет ключа | `MISSING_CREDENTIAL` |
| 401/403 | `INVALID_CREDENTIAL` (24 ч cooldown) |
| 402 или quota-слова в теле | `QUOTA` (`Retry-After` или 10 мин) |
| 429 | `RATE_LIMIT` (`Retry-After` или 60 с) |
| 404 | `UNSUPPORTED_MODEL` |
| 408/504 | `TIMEOUT` |
| 5xx/503 | `SERVER` (30 с) |
| пустой стрим | `EMPTY_RESPONSE` |

## 7. Хранение

`$DSH_HOME/storages/dsh-ollama/`:

- `cooldowns.json` — `{cooldowns: {fingerprint: {until, reason}}}`, максимум 50;
- `sticky.json` — `{sticky: {sessionId: {fingerprint, label, provider, model, at}}}`, максимум 500, 14 дней;
- `requests.jsonl` — метаданные запросов для heatmap, компакция при 2 MB до 5000 строк.

Ключи и тексты не сохраняются.

## 8. Открытые вопросы для live-проверки

1. Точный код нехватки кредитов (402/429/400) — классифицируется по телу.
2. Поле reasoning в OpenAI-совместимом ответе — парсятся `reasoning_content`, `reasoning`, `thinking`.
3. Поддержка `POST /api/show` на cloud — используется только как lazy-enrichment, fail-open.
4. Значения `done_reason` кроме `stop` — маппинг `length` → `max-tokens`, остальные → `stop`.
