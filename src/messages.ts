import {
  type ContentBlock,
  type GenerateOptions,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'

import type { EffectiveModel } from './catalog.ts'
import { effectiveMaxTokens } from './catalog.ts'
import type { ResolvedConfig } from './config.ts'
import { filePlaceholder } from './files.ts'
import { offloadPlaceholder, type ImageMap } from './images.ts'
import { normalizeToolParameters } from './tool-schema.ts'

export interface NativeToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}

export interface NativeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: NativeToolCall[]
  tool_name?: string
}

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null | OpenAIContentPart[]
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

function textOnly(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
    else if (block.type === 'image') parts.push(offloadPlaceholder(block.attachment))
    else if (block.type === 'file') parts.push(filePlaceholder(block.attachment))
  }
  return parts.join('')
}

function hasImageBlocks(content: readonly ContentBlock[]): boolean {
  return content.some((block) => block.type === 'image' && block.offloaded !== true)
}

function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1)
}

function toolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const normalizedParameterCache = new WeakMap<object, { value: unknown }>()

function normalizedParameters(parameters: unknown): unknown {
  if (typeof parameters !== 'object' || parameters === null) return normalizeToolParameters(parameters)
  const cached = normalizedParameterCache.get(parameters)
  if (cached !== undefined) return cached.value
  const value = normalizeToolParameters(parameters)
  normalizedParameterCache.set(parameters, { value })
  return value
}

export function buildTools(tools: readonly ToolSchema[] | undefined): unknown[] | undefined {
  if (tools === undefined || tools.length === 0) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizedParameters(tool.parameters),
    },
  }))
}

/** Convert the harness conversation into native `/api/chat` messages. */
export function buildNativeMessages(options: GenerateOptions, images?: ImageMap): NativeMessage[] {
  const system: string[] = []
  if (options.system !== undefined && options.system !== '') system.push(options.system)
  const toolNames = new Map<string, string>()
  const messages: NativeMessage[] = []

  for (const message of options.messages) {
    switch (message.role) {
      case 'system':
      case 'developer': {
        const text = textOnly(message.content)
        if (text !== '') system.push(text)
        break
      }
      case 'user': {
        const text: string[] = []
        const base64: string[] = []
        for (const block of message.content) {
          if (block.type === 'text') text.push(block.text)
          else if (block.type === 'image') {
            const image = block.offloaded === true
              ? undefined
              : images?.get(block.attachment.attachmentId)
            if (image === undefined) text.push(offloadPlaceholder(block.attachment))
            else base64.push(base64Of(image.dataUrl))
          } else if (block.type === 'file') text.push(filePlaceholder(block.attachment))
        }
        messages.push({
          role: 'user',
          content: text.join(''),
          ...(base64.length === 0 ? {} : { images: base64 }),
        })
        break
      }
      case 'assistant': {
        const calls: NativeToolCall[] = []
        for (const block of message.content) {
          if (block.type !== 'tool-call') continue
          toolNames.set(block.id, block.name)
          calls.push({
            function: { name: block.name, arguments: toolArguments(block.arguments) },
          })
        }
        messages.push({
          role: 'assistant',
          content: textOnly(message.content),
          ...(calls.length === 0 ? {} : { tool_calls: calls }),
        })
        break
      }
      case 'tool': {
        const name = toolNames.get(message.toolCallId)
        messages.push({
          role: 'tool',
          content: textOnly(message.content),
          ...(name === undefined ? {} : { tool_name: name }),
        })
        break
      }
    }
  }

  if (system.length > 0) messages.unshift({ role: 'system', content: system.join('\n\n') })
  return messages
}

function nativeThink(
  effort: string | undefined,
  model: EffectiveModel,
): boolean | string | undefined {
  if (effort === undefined || effort === '') return undefined
  if (effort === 'off' || effort === 'none') return false
  if (model.reasoningToggle) return true
  if (model.reasoning.includes(effort)) return effort
  return ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : undefined
}

/** Build the native `/api/chat` request body for one model. */
export function buildNativeBody(
  options: GenerateOptions,
  model: EffectiveModel,
  config: ResolvedConfig,
  images?: ImageMap,
): Record<string, unknown> {
  const tools = buildTools(options.tools)
  const maxTokens = options.maxTokens ?? effectiveMaxTokens(model, config)
  const think = nativeThink(
    options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort),
    model,
  )
  const nativeOptions: Record<string, unknown> = {
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(maxTokens === undefined || maxTokens <= 0 ? {} : { num_predict: maxTokens }),
    ...(options.stop === undefined || options.stop.length === 0 ? {} : { stop: options.stop }),
  }

  return {
    model: options.model,
    messages: buildNativeMessages(options, images),
    stream: true,
    ...(tools === undefined ? {} : { tools }),
    ...(think === undefined ? {} : { think }),
    ...(Object.keys(nativeOptions).length === 0 ? {} : { options: nativeOptions }),
  }
}

function openAiUserContent(
  content: readonly ContentBlock[],
  images: ImageMap | undefined,
): string | OpenAIContentPart[] {
  if (!hasImageBlocks(content)) return textOnly(content)
  const parts: OpenAIContentPart[] = []
  for (const block of content) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type === 'image') {
      const image = block.offloaded === true ? undefined : images?.get(block.attachment.attachmentId)
      if (image === undefined) {
        parts.push({ type: 'text', text: offloadPlaceholder(block.attachment) })
      } else {
        parts.push({ type: 'image_url', image_url: { url: image.dataUrl } })
      }
      continue
    }
    if (block.type === 'file') parts.push({ type: 'text', text: filePlaceholder(block.attachment) })
  }
  return parts
}

/** Convert the harness conversation into OpenAI Chat messages. */
export function buildChatMessages(options: GenerateOptions, images?: ImageMap): OpenAIMessage[] {
  const system: string[] = []
  if (options.system !== undefined && options.system !== '') system.push(options.system)
  const messages: OpenAIMessage[] = []

  for (const message of options.messages) {
    switch (message.role) {
      case 'system':
      case 'developer': {
        const text = textOnly(message.content)
        if (text !== '') system.push(text)
        break
      }
      case 'user': {
        messages.push({ role: 'user', content: openAiUserContent(message.content, images) })
        break
      }
      case 'assistant': {
        const calls: OpenAIToolCall[] = []
        for (const block of message.content) {
          if (block.type !== 'tool-call') continue
          calls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: block.arguments },
          })
        }
        const text = textOnly(message.content)
        messages.push({
          role: 'assistant',
          content: text !== '' ? text : calls.length > 0 ? null : '',
          ...(calls.length === 0 ? {} : { tool_calls: calls }),
        })
        break
      }
      case 'tool': {
        messages.push({
          role: 'tool',
          content: textOnly(message.content),
          tool_call_id: message.toolCallId,
        })
        break
      }
    }
  }

  if (system.length > 0) messages.unshift({ role: 'system', content: system.join('\n\n') })
  return messages
}

/** Build the OpenAI Chat request body for one model. */
export function buildChatBody(
  options: GenerateOptions,
  model: EffectiveModel,
  config: ResolvedConfig,
  images?: ImageMap,
): Record<string, unknown> {
  const tools = buildTools(options.tools)
  const maxTokens = options.maxTokens ?? effectiveMaxTokens(model, config)
  const effort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort)
  const reasoning = effort === undefined || effort === ''
    ? undefined
    : effort === 'off' ? 'none' : effort

  return {
    model: options.model,
    messages: buildChatMessages(options, images),
    stream: true,
    stream_options: { include_usage: true },
    ...(tools === undefined ? {} : { tools, tool_choice: 'auto' }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(maxTokens === undefined || maxTokens <= 0 ? {} : { max_tokens: maxTokens }),
    ...(reasoning === undefined ? {} : { reasoning_effort: reasoning }),
    ...(options.stop === undefined || options.stop.length === 0 ? {} : { stop: options.stop }),
  }
}
