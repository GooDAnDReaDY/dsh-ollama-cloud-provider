# DESIGN.md — dsh-ollama-cloud-provider

## Product / Purpose
- Назначение: нативный LLM-провайдер Ollama Cloud для DeepSeek Harness (DSH).
- Аудитория: пользователи DSH Desktop/Web/TUI, у которых есть ключ Ollama Cloud.
- Статус: 0.1.34 cloud-only, опубликован и проверен на production Web/Desktop; 0.1.33 — предыдущий релиз. Источник версии: `package.json`; история: `CHANGELOG.md`.

## User Surfaces
- Web/UI: settings-страница, карточка квоты в сайдбаре, центральная панель с расходом, аналитикой и heatmap.
- DSH UI / settings / slots: `settings.section` (id `ollama`, order 20) — так же, как в референсных плагинах opencode и commandcode; `main` (key `ollama-panel`), `sidebar.footer.action` (id `ollama-quota`).
- API: host-маршруты `/dsh-ollama/state|health|analytics|usage|balance|config|key|key/clear|refresh|models/refresh|test|update`; web providers `ollama-cloud` через `ctx.web` (search/fetch).
- CLI: команда `/ollama`; TUI-секция настроек.
- Документация: README.md, README.ru.md, README.zh.md, DESIGN.md, CHANGELOG.md.

## Visual Direction
- Атмосфера: нативная для DSH, без собственного брендинга и без emoji в интерфейсе.
- Утверждённые референсы: карточки и панели `dsh-opencode-provider` и `dsh-commandcode-provider`.
- Не копировать: чужие бренды, ассеты, тексты, полные страницы.

## Foundations
- Цвета и роли: только переменные темы `--dsw-alias-*`; собственные роли `--ocl-*` строятся на них.
- Типографика: наследуется от DSH.
- Сетка, отступы, responsive: карточки 12px radius, панель до 760px, KPI-сетка 4→2 колонки.
- Accessibility: кнопки вместо div с обработчиком, `aria-expanded` для раскрытия, фокус-кольцо темы.

## Components And States
- Компоненты: `OllamaCloudSettingsPage`, `QuotaCard`, `QuotaPanel`, `UsageBars`, `UsageAnalyticsView`, `RequestHeatmapView`, `PluginUpdateCard`.
- Loading / empty / error / success: `loading` — текст загрузки; `empty` — «нет данных»; `error` — красная плашка; `success` — notice.
- Формы, валидация и действия: ключ вводится в settings-странице, пишется через credential-сервис; конфиг сохраняется явной кнопкой; невалидные числа отклоняются.

## User Flows
- Ввод ключа: Settings → Ollama Cloud → вставить ключ → Save key → Test connection.
- Проверка расхода: sidebar-карточка → панель → окна 24h/7d/30d, расход по моделям, аналитика, heatmap.
- Ротация: неверный/ограниченный ключ охлаждается, следующий аккаунт обслуживает запрос до первого токена.

## Do / Don't

- 2026-11-06 — все значки и виджеты на экране (включая сайдбар-карточку `showSidebarQuota`) изначально отключены (`false`) по умолчанию и активируются только пользователем вручную через настройки; UI-тесты строго фиксируют этот инвариант (#100).
- Do: хранить ключи только в credential-сервисе; писать только через loopback/same-origin; использовать переменные темы.
- Don't: не логировать ключи и тексты; не менять навигацию DSH без согласования; не добавлять русские строки в код.

## Locked Design Decisions
- 2026-10-21 — провайдер только Ollama Cloud, без локального маршрута; причина: рамки задачи; пересмотр — отдельная задача.
- 2026-10-21 — нативный `/api/chat` по умолчанию, OpenAI `/v1/chat/completions` как опция; причина: thinking и счётчики.
- 2026-10-21 — настройки размещены в `settings.section` (id `ollama`, order 20). Это сознательный паритет с референсами: `dsh-opencode-provider` использует `settings.section` (id `opencode`, order 20), `dsh-commandcode-provider` — `settings.section` (id `commandcode`, order 12). Вопрос аудита #6 закрыт как не дефект; пересмотр — только по отдельной просьбе владельца.
- 2026-10-21 — sidebar-карточка показывается только при `showSidebarQuota === true`; включение применяется без перезагрузки через `CONFIG_CHANGED_EVENT`. Причина: настройка должна управлять и видимостью, и опросом `/state`.
- 2026-10-21 — динамический `<style>` помечается `data-dsh-plugin="dsh-ollama-cloud-provider"`; причина: очистка соседних плагинов не должна удалять наши стили.
- 2026-10-21 — «Test connection» отключает thinking (`reasoningEffort: 'off'`) и использует 64 токена; причина: thinking-модели при 32 возвращали пустой ответ, значение поднято в #17.
- 2026-10-22 — все write-маршруты требуют `Origin` или `Referer` с хостом, совпадающим с `Host`; без обоих — 403. Исключение — Desktop-рендерер: у него нет `Origin`/`Referer` (схема `dsh-app://`), но есть cookie `dsh-auth-*` и UA `@deepseek-ai/dsh-desktop/`; принимаем только оба признака после loopback-проверок `Host` и сокета. Причина: LAN-мост `dsh-lanmode` переписывает `Host` и сокет в loopback, поэтому одной loopback-проверки недостаточно (#28).
- 2026-11-02 — Desktop-исключение больше не считает имя cookie и UA доказательством: после loopback-проверок плагин отправляет cookie на host-маршрут `/api/version` и отклоняет запись при 401/403 или ошибке проверки. Причина: поддельная `dsh-auth-*` проходила прежнюю проверку по подстроке (#42).
- 2026-11-02 — локальный многовариантный `test:engine` удалён: он создавал собственный DSH-контур, ставил пакет через `file:` из worktree и применял принудительную очистку. Совместимость проверяется на утверждённом DSH test server по `docs/testing/test-server.md` (#47).
- 2026-11-02 — `state`, `analytics`, `usage` и `balance` требуют проверенную host-сессию (cookie проверяется через host `/api/version`); `health` и `status` остаются публичными. Ролевое разделение guest/admin остаётся ответственностью внешнего LAN-контура (#56).
- 2026-11-02 — пустой `visibleModels` при `showAllModels:false` означает «скрыть все»; при отсутствии `showAllModels` сохраняется legacy-семантика «пусто = все» (#63).
