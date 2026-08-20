/**
 * Claude Code adapter: `claude --print --verbose --output-format stream-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. The prompt goes over stdin.
 *
 * @module dsh-harness-call/host/adapters/claude
 */

import { HARNESS_LABELS } from '../../shared/harness.js'
import type { HarnessEvent } from '../../shared/events.js'
import type { HarnessAdapter, Outcome, RunInfo, RunRequest, RunResult, RunState, SpawnSpec } from '../adapter.js'
import { exitFailure, isRecord, missingCallId, readNumber, readRecord, readString, toolOutputText } from './native.js'

/**
 * Claude reports the run's verdict in one terminal `result` event carrying the
 * final text, the session id, and the cost/turn accounting; the streamed
 * assistant blocks are only progress. `finalize` therefore treats a missing
 * `result` as a failure rather than trusting the accumulated text.
 */
export interface ClaudeState extends RunState {
  /** The terminal `type: "result"` event, once seen. */
  result?: Record<string, unknown>
  /**
   * `tool_use.id` → tool name, so a `tool_result` block (which carries no
   * name of its own) can still render if the matching start was dropped.
   */
  tools: Map<string, string>
}

export const claudeAdapter: HarnessAdapter<ClaudeState> = {
  key: 'claude',
  label: HARNESS_LABELS.claude,
  bin: 'claude',

  createState(): ClaudeState {
    return { text: '', tools: new Map() }
  },

  build(req: RunRequest): SpawnSpec {
    const argv = ['--print', '--verbose', '--output-format', 'stream-json']
    argv.push(req.mode === 'resume' ? '--resume' : '--session-id', req.sessionId)
    if (req.access === 'read-only') {
      // Headless Claude has no OS sandbox flag. `plan` keeps it from applying
      // edits or running mutating tools; that is the closest match to
      // read-only among the published permission modes.
      argv.push('--permission-mode', 'plan')
    } else if (req.access === 'workspace-write') {
      argv.push('--permission-mode', 'acceptEdits')
    } else if (req.access === 'full-access') {
      argv.push('--permission-mode', 'bypassPermissions')
    }
    if (req.effort !== undefined) argv.push('--effort', req.effort)
    return {
      argv,
      stdin: req.prompt,
      // A Claude Code host may inject short-lived gateway credentials into the
      // environment; the spawned CLI must run on its own credential store, so
      // both are tombstoned. `undefined` REMOVES the inherited variable — it
      // does not set it to an empty string, which the CLI would still try to
      // use as a base URL.
      env: { ANTHROPIC_AUTH_TOKEN: undefined, ANTHROPIC_BASE_URL: undefined },
    }
  },

  translate(native: unknown, state: ClaudeState): HarnessEvent[] {
    if (!isRecord(native)) return []
    const type = native['type']

    if (type === 'assistant') {
      // Sub-agent traffic rides the same stream, tagged with the tool call
      // that spawned it. It belongs to that tool's own transcript, not to this
      // run's reply, so it is neither shown nor accumulated.
      if (native['parent_tool_use_id']) return []
      const content = readRecord(native, 'message')?.['content']
      if (!Array.isArray(content)) return []

      const events: HarnessEvent[] = []
      for (const block of content) {
        if (!isRecord(block)) continue
        const blockType = block['type']
        if (blockType === 'text') {
          const text = readString(block, 'text')
          // Whitespace-only blocks are stream padding and carry no reply.
          if (text === undefined || text.trim() === '') continue
          state.text += text
          events.push({ kind: 'text', text })
        } else if (blockType === 'thinking') {
          const text = readString(block, 'thinking')
          if (text === undefined || text.trim() === '') continue
          events.push({ kind: 'reasoning', text })
        } else if (blockType === 'tool_use') {
          const name = readString(block, 'name')
          if (name === undefined) continue
          const callId = readString(block, 'id')
          if (callId === undefined) {
            events.push(missingCallId(`tool ${name} started`))
            continue
          }
          state.tools.set(callId, name)
          // The whole input is kept: the panel expands it on demand, and a
          // shortened one could not be inspected after the fact.
          const input = block['input']
          events.push(input === undefined
            ? { kind: 'tool_start', callId, name }
            : { kind: 'tool_start', callId, name, input })
        }
      }
      return events
    }

    if (type === 'user') {
      // Tool results ride as `tool_result` blocks on a user frame. Sub-agent
      // traffic is tagged the same way as assistant frames and is dropped.
      if (native['parent_tool_use_id']) return []
      const content = readRecord(native, 'message')?.['content']
      if (!Array.isArray(content)) return []
      const events: HarnessEvent[] = []
      for (const block of content) {
        if (!isRecord(block) || block['type'] !== 'tool_result') continue
        const callId = readString(block, 'tool_use_id')
        const name = (callId !== undefined ? state.tools.get(callId) : undefined) ?? 'tool'
        if (callId === undefined) {
          events.push(missingCallId(`tool ${name} completed`))
          continue
        }
        const output = toolResultOutput(block)
        const isError = block['is_error'] === true
        events.push({
          kind: 'tool_finish',
          callId,
          name,
          ...(output !== undefined ? { output } : {}),
          exitCode: isError ? 1 : 0,
        })
      }
      return events
    }

    if (type === 'system' && native['subtype'] === 'init') {
      const sessionId = readString(native, 'session_id')
      return [sessionId === undefined ? { kind: 'note', text: 'session init' } : { kind: 'session', sessionId }]
    }

    if (type === 'result') {
      state.result = native
      const usage = claudeUsage(native)
      // A `result` event that accounts for nothing is not worth a timeline
      // entry of its own; `finalize` still reads the event from state.
      if (!hasUsage(usage)) return []
      return [{ kind: 'usage', ...usage }]
    }

    return []
  },

  finalize(state: ClaudeState, outcome: Outcome, info: RunInfo): RunResult {
    const errors: string[] = []
    const result = state.result

    if (info.timedOut) errors.push(`claude exceeded ${info.timeoutSeconds}s and was terminated`)
    const exit = exitFailure('claude', outcome)
    if (exit !== undefined) errors.push(exit)

    if (result === undefined) errors.push('missing claude result event')
    else {
      const subtype = result['subtype']
      const shown = String(subtype ?? '?')
      if (result['is_error'] === true) errors.push(`claude error result (subtype ${shown})`)
      else if (subtype !== 'success') errors.push(`unexpected claude result subtype: ${shown}`)
      if (readString(result, 'session_id') === undefined) errors.push('claude result event has no session_id')
    }

    const finalText = readString(result, 'result')
    return {
      ok: errors.length === 0,
      // The terminal event's text is authoritative; the accumulated deltas are
      // the fallback for a run that died before reporting one.
      text: finalText !== undefined && finalText.length > 0 ? finalText : state.text,
      sessionId: readString(result, 'session_id') ?? null,
      errors,
      extras: extrasFromUsage(claudeUsage(result)),
    }
  },
}

/** Flatten one `tool_result` block's content into the stored output string. */
function toolResultOutput(block: Record<string, unknown>): string | undefined {
  const content = block['content']
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push(part)
        continue
      }
      if (!isRecord(part)) continue
      const text = readString(part, 'text') ?? readString(part, 'content')
      if (text !== undefined) parts.push(text)
    }
    if (parts.length > 0) return parts.join('')
  }
  return toolOutputText(content)
}

/** Model id Claude reported: `modelUsage` keys first, then a flat `model`. */
function claudeModel(native: Record<string, unknown> | undefined): string | undefined {
  if (native === undefined) return undefined
  const usage = readRecord(native, 'modelUsage')
  if (usage !== undefined) {
    const keys = Object.keys(usage)
    const first = keys[0]
    if (first !== undefined) {
      const bracket = first.indexOf('[')
      return bracket > 0 ? first.slice(0, bracket) : first
    }
  }
  return readString(native, 'model')
}

function claudeUsage(native: Record<string, unknown> | undefined): {
  costUsd?: number
  turns?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  model?: string
} {
  if (native === undefined) return {}
  const usage = readRecord(native, 'usage')
  const cached = readNumber(usage, 'cache_read_input_tokens')
  const created = readNumber(usage, 'cache_creation_input_tokens')
  const cachedTokens = cached === undefined && created === undefined
    ? undefined
    : (cached ?? 0) + (created ?? 0)
  return {
    costUsd: readNumber(native, 'total_cost_usd'),
    turns: readNumber(native, 'num_turns'),
    inputTokens: readNumber(usage, 'input_tokens'),
    outputTokens: readNumber(usage, 'output_tokens'),
    cachedTokens,
    model: claudeModel(native),
  }
}

function hasUsage(usage: Record<string, unknown>): boolean {
  return Object.values(usage).some(value => value !== undefined)
}

function extrasFromUsage(usage: {
  costUsd?: number
  turns?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
}): RunResult['extras'] {
  return {
    costUsd: usage.costUsd,
    numTurns: usage.turns,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
    reasoningTokens: usage.reasoningTokens,
    model: usage.model,
  }
}
