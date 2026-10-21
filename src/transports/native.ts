import {
  LlmError,
  ToolCallId,
  type FinishReason,
  type StreamChunk,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'

import { classifyStreamError } from '../errors.ts'
import { ndjsonObjects } from './ndjson.ts'

interface NativeToolCall {
  function?: { name?: unknown; arguments?: unknown }
}

interface NativeMessage {
  role?: unknown
  content?: unknown
  thinking?: unknown
  tool_calls?: NativeToolCall[]
}

interface NativeChunk {
  message?: NativeMessage
  done?: unknown
  done_reason?: unknown
  prompt_eval_count?: unknown
  prompt_eval_cached_count?: unknown
  eval_count?: unknown
  error?: unknown
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function finishReasonOf(raw: string, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return { kind: 'tool-calls' }
  if (raw === 'length') return { kind: 'max-tokens' }
  return { kind: 'stop' }
}

function usageOf(chunk: NativeChunk): TokenUsage | undefined {
  const prompt = count(chunk.prompt_eval_count)
  const output = count(chunk.eval_count)
  if (prompt === undefined && output === undefined) return undefined
  const cached = count(chunk.prompt_eval_cached_count) ?? 0
  const input = Math.max(0, (prompt ?? 0) - cached)
  return {
    inputTokens: input,
    outputTokens: output ?? 0,
    totalTokens: (prompt ?? 0) + (output ?? 0),
    ...(cached > 0 ? { cacheReadTokens: cached } : {}),
  }
}

/**
 * Parse a native Ollama `/api/chat` NDJSON stream into harness chunks:
 * text, thinking, complete tool calls (Ollama sends arguments as an object),
 * counters from the final line, and a terminal finish reason.
 */
export async function* parseNativeStream(
  response: Response,
  idleTimeoutMs: number,
  signal: AbortSignal | undefined,
): AsyncIterable<StreamChunk> {
  if (response.body === null) {
    throw new LlmError('Ollama Cloud returned an empty response body', 'EMPTY_RESPONSE')
  }

  let nextIndex = 0
  let textIndex: number | undefined
  let textValue = ''
  let reasoningIndex: number | undefined
  let reasoningValue = ''
  const toolBlocks: Array<{ index: number; id: string; name: string; arguments: string }> = []
  let sawContent = false
  let doneReason = 'stop'

  for await (const raw of ndjsonObjects(response.body, idleTimeoutMs, signal)) {
    const chunk = raw as NativeChunk
    const streamError = classifyStreamError(chunk)
    if (streamError !== undefined) throw streamError

    const thinking = text(chunk.message?.thinking)
    if (thinking !== '') {
      if (reasoningIndex === undefined) {
        reasoningIndex = nextIndex++
        yield { type: 'block-start', index: reasoningIndex, blockType: 'reasoning' }
      }
      reasoningValue += thinking
      sawContent = true
      yield { type: 'reasoning-delta', index: reasoningIndex, text: thinking }
    }

    const content = text(chunk.message?.content)
    if (content !== '') {
      if (textIndex === undefined) {
        textIndex = nextIndex++
        yield { type: 'block-start', index: textIndex, blockType: 'text' }
      }
      textValue += content
      sawContent = true
      yield { type: 'text-delta', index: textIndex, text: content }
    }

    for (const call of chunk.message?.tool_calls ?? []) {
      const name = text(call.function?.name)
      const rawArguments = call.function?.arguments
      const argumentsText = typeof rawArguments === 'string'
        ? rawArguments
        : JSON.stringify(rawArguments ?? {})
      const index = nextIndex++
      const id = `call_${toolBlocks.length}`
      toolBlocks.push({ index, id, name, arguments: argumentsText })
      sawContent = true
      yield { type: 'block-start', index, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index,
        id: ToolCallId(id),
        ...(name === '' ? {} : { name }),
        argumentsDelta: argumentsText,
      }
    }

    if (chunk.done === true) {
      doneReason = text(chunk.done_reason) || 'stop'
      if (reasoningIndex !== undefined) {
        yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoningValue } }
      }
      if (textIndex !== undefined) {
        yield { type: 'block-end', index: textIndex, block: { type: 'text', text: textValue } }
      }
      for (const block of toolBlocks) {
        yield {
          type: 'block-end',
          index: block.index,
          block: {
            type: 'tool-call',
            id: ToolCallId(block.id),
            name: block.name,
            arguments: block.arguments === '' ? '{}' : block.arguments,
          },
        }
      }
      const usage = usageOf(chunk)
      if (usage !== undefined) yield { type: 'usage', usage }
      if (!sawContent) {
        throw new LlmError('Ollama Cloud completed the request without content', 'EMPTY_RESPONSE')
      }
      yield { type: 'finish', reason: finishReasonOf(doneReason, toolBlocks.length > 0) }
      return
    }
  }

  if (!sawContent) {
    throw new LlmError('Ollama Cloud returned an empty stream', 'EMPTY_RESPONSE')
  }
}
