import { randomUUID } from 'node:crypto'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

/**
 * Ensures tool-call ids are globally unique across steps and turns in a session.
 * Reusing ids breaks DSH session log validation with "PTC dispatch repeats subCallId".
 */
export function uniqueToolCallId(raw?: unknown): ToolCallId {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed !== '') return ToolCallId(trimmed)
  }
  return ToolCallId(`call_${randomUUID()}`)
}
