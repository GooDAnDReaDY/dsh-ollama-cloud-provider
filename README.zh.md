# 📦 @goodandready/dsh-ollama-cloud-provider

DeepSeek Harness（dsh）的 **Ollama Cloud** 模型提供方插件。

插件注册一个路由 `ollama-cloud`（`https://ollama.com`），支持两种传输协议：

| 传输 | 端点 | 用途 |
|---|---|---|
| `native`（默认） | `POST /api/chat` | thinking、工具调用、usage 计数 |
| `openai-chat` | `POST /v1/chat/completions` | OpenAI 兼容部署与回退 |

密钥在每次请求时解析，更换凭据无需重启。

## 功能

- 按模型选择两种传输协议。
- 文本、thinking、工具调用、图像、usage 和结束原因。
- 从 `GET /v1/models` 读取实时模型目录，并用 `GET /api/tags` 的 `capabilities` 补充能力。
- 模型选择器中的准确元数据：上下文窗口、输入模态、推理等级及默认值、工具支持、API 可见性。
- 从官方 `/api/balance` 和 `/api/usage` 读取余额与用量：包含额度、购买额度、24 小时 / 7 天 / 30 天支出、按模型支出。
- 多账号轮换在**首个 token 之前**完成：401/403/429 与配额耗尽会标记密钥并切换到下一个。冷却状态重启后保留。
- 每个会话的粘性账号，以及 `模型 → 账号` 的 glob 规则。
- 按 Ollama 公开价目表估算费用，包含 off-peak 价格，并支持按模型覆盖。
- 浏览器界面：**设置 → Ollama Cloud**、侧边栏配额卡片（默认关闭，关闭时不会轮询 `/state`）、含用量分析、热力图和路由记录的中央面板。
- `/ollama` 命令、TUI 设置区、一键插件更新。

## 安装

```bash
npm install
npm run build
npm pack
dsh plugin --profile web add /absolute/path/to/goodandready-dsh-ollama-cloud-provider-0.1.0.tgz
# DSH Desktop:
dsh plugin --profile desktop add /absolute/path/to/goodandready-dsh-ollama-cloud-provider-0.1.0.tgz
```

重启 dsh，然后在模型列表中选择 **Ollama Cloud**。

## 配置

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

除 `apiKey` 外的所有字段都是 volatile，可直接在 dsh 设置中编辑。

### 密钥

1. `config.apiKey`：仅用于 composition，`role('secret')`。
2. dsh 凭据服务中的 `apiKeyEnv`（默认 `OLLAMA_API_KEY`）。
3. 启动环境变量。

在 <https://ollama.com/settings/keys> 创建密钥，密钥不会过期。云端只接受 `Authorization: Bearer`，不接受 `x-api-key`。

### 账号与轮换

在 **设置 → Ollama Cloud → 账号** 中添加账号：填写名称与凭据引用（如 `OLLAMA_API_KEY_2`），粘贴密钥并保存。轮换发生在流式输出之前；被拒绝的密钥进入冷却，请求由下一个可用密钥继续。冷却信息保存在 `~/.dsh/storages/dsh-ollama/cooldowns.json`，仅使用 SHA-256 指纹，不写入原始密钥。

### 模型 → 账号规则

```yaml
modelAccountRules:
  - pattern: "*flash*"
    account: "Work"
```

第一个匹配的 glob 优先使用指定账号，其余账号仍作后备。

## 余额与用量

- `GET /api/balance`：新格式（`included.balance_usd`、`allowance_usd`、`period`、`purchased.balance_usd`）与旧格式（`session` / `weekly` 的 `remaining_percent`）均支持。
- `GET /api/usage?range=24h|7d|30d&group_by=model`：总计与按模型分组。

`/api/usage` 限制为**每位用户每分钟 10 次请求**，因此余额缓存 60 秒、用量缓存 120 秒、失败缓存 30 秒，不做后台轮询。配额不可用不影响聊天。

## 命令

```
/ollama status
/ollama usage
/ollama balance
/ollama accounts
/ollama models
/ollama rules
/ollama test [model]
```

## 已验证的 API 事实（2026-10-21）

- `GET https://ollama.com/v1/models` 公开，除标准 `data[]` 外还返回非标准 `models[]`，包含上下文、模态、推理等级、`visibility` 和 `supported_in_api`。
- `GET https://ollama.com/api/tags` 公开，是按模型获取 `capabilities` 的唯一来源。
- 实时目录返回 23 个云端模型。
- 原生 `/api/chat` 使用 NDJSON，最后一行包含计数与 `done_reason`。
- OpenAI `/v1/chat/completions` 支持流式、工具、图像、`reasoning_effort` 与 `include_usage`。
- Anthropic 兼容接口（`/v1/messages`）仅部分支持，本插件未使用。

## 开发

```bash
npm run typecheck
npm test
npm run build
npm run check
node scripts/probe.mjs
```

## 限制

- 仅支持 Ollama Cloud；不注册本地 `http://localhost:11434`。
- 不支持 embeddings：实时目录中没有模型声明 `embedding` 能力。
- 文件附件以确定的文本句柄传递，而不是内联字节。
- 费用为公开价目表的估算值，最终以网关为准。
- UI 需要 web profile；TUI 保留 `/ollama` 命令与模型路由。

## 许可证

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)。参见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
