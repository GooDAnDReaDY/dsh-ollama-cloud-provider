# Changelog

## 0.1.0

Initial release.

- Registers the `ollama-cloud` provider route for DeepSeek Harness.
- Native `/api/chat` transport (NDJSON) with thinking, tool calls, images and usage counters.
- OpenAI-compatible `/v1/chat/completions` transport selectable per model.
- Live model catalog from `/v1/models` enriched with `/api/tags` capabilities, plus an offline snapshot.
- Balance from `/api/balance` (credits and legacy percentage windows) and spend from `/api/usage`
  with 24-hour, 7-day and 30-day windows and per-model groups.
- Multi-account rotation before the first streamed token, persistent cooldowns, sticky sessions and
  model → account glob rules.
- Price estimates including off-peak rates and per-model overrides.
- Settings page, sidebar quota card, quota/analytics panel with a request heatmap, `/ollama` command,
  TUI settings section and one-click plugin update.
