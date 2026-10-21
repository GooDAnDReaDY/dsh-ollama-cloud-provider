# DESIGN.md — dsh-ollama-cloud-provider

## Product / Purpose
- Назначение: нативный LLM-провайдер Ollama Cloud для DeepSeek Harness (DSH).
- Аудитория: пользователи DSH Desktop/Web/TUI, у которых есть ключ Ollama Cloud.
- Статус: 0.1.0 установлен локально в Desktop; публично не выпускался.

## User Surfaces
- Web/UI: settings-страница, карточка квоты в сайдбаре, центральная панель с расходом, аналитикой и heatmap.
- DSH UI / settings / slots: `settings.section` (id `ollama`), `main` (key `ollama-panel`), `sidebar.footer.action` (id `ollama-quota`).
- API: host-маршруты `/dsh-ollama/state|health|analytics|usage|balance|config|key|key/clear|refresh|models/refresh|test|update`.
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
- Do: хранить ключи только в credential-сервисе; писать только через loopback/same-origin; использовать переменные темы.
- Don't: не логировать ключи и тексты; не менять навигацию DSH без согласования; не добавлять русские строки в код.

## Locked Design Decisions
- 2026-10-21 — провайдер только Ollama Cloud, без локального маршрута; причина: рамки задачи; пересмотр — отдельная задача.
- 2026-10-21 — нативный `/api/chat` по умолчанию, OpenAI `/v1/chat/completions` как опция; причина: thinking и счётчики.
- 2026-10-21 — настройки размещены в `settings.section`; причина: паритет с `dsh-opencode-provider`. Открытый вопрос аудита M4: канонический слот `settings.plugin.item`; пересмотр — после решения владельца.
- 2026-10-21 — sidebar-карточка показывается только при `showSidebarQuota === true`; включение применяется без перезагрузки через `CONFIG_CHANGED_EVENT`. Причина: настройка должна управлять и видимостью, и опросом `/state`.
- 2026-10-21 — динамический `<style>` помечается `data-dsh-plugin="dsh-ollama-cloud-provider"`; причина: очистка соседних плагинов не должна удалять наши стили.
- 2026-10-21 — «Test connection» отключает thinking (`reasoningEffort: 'off'`) и использует 32 токена; причина: thinking-модели возвращали пустой ответ.
