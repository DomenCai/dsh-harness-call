/**
 * Grok CLI adapter: `grok -p <prompt> --output-format streaming-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. Unlike the other two harnesses the prompt is
 * an argument, not stdin, so this adapter spawns with no stdin at all.
 * Reasoning effort is passed as `--reasoning-effort` only when one was
 * resolved (a concrete setting or a tool argument); otherwise the CLI's own
 * config default applies. Access maps onto built-in sandbox profiles
 * (`read-only` / `workspace` / `off`) plus `dontAsk` so headless runs do
 * not stall on an approval prompt this plugin cannot answer.
 *
 * @module dsh-harness-call/host/adapters/grok
 */

import { HARNESS_LABELS } from '../../shared/harness.js'
import type { HarnessEvent } from '../../shared/events.js'
import type { HarnessAdapter, Outcome, RunInfo, RunRequest, RunResult, RunState, SpawnSpec } from '../adapter.js'
import { exitFailure, isRecord, missingCallId, readNumber, readRecord, readString, toolOutputText } from './native.js'

/**
 * Grok streams the reply as `text` deltas and reasoning as per-token `thought`
 * deltas, and closes with one `end` frame carrying the session id, a stop
 * reason, and the cost/turn accounting; an `error` frame replaces it.
 * `finalize` checks the `end` frame's session id against the requested one —
 * a mismatch means the reply belongs to a different conversation.
 */
export interface GrokState extends RunState {
  /** The terminal `end` frame, once seen. */
  end?: Record<string, unknown>
  /** The `error` frame, once seen; supersedes `end`. */
  error?: Record<string, unknown>
  /**
   * `toolCallId` → tool name, so a `tool_call_update` (which carries no name
   * of its own) can be attributed to the tool the `tool_call` announced.
   */
  tools: Map<string, string>
}

export const grokAdapter: HarnessAdapter<GrokState> = {
  key: 'grok',
  label: HARNESS_LABELS.grok,
  bin: 'grok',

  createState(): GrokState {
    return { text: '', tools: new Map() }
  },

  build(req: RunRequest): SpawnSpec {
    // The prompt travels as an argument: this CLI takes no stdin, so the
    // spawn asks for none at all rather than handing it an empty pipe.
    const argv = [
      '-p',
      req.prompt,
      '--cwd',
      req.cwd,
      req.mode === 'resume' ? '--resume' : '--session-id',
      req.sessionId,
      '--output-format',
      'streaming-json',
      '--background-wait-timeout',
      String(req.timeoutSeconds),
    ]
    // Effort is passed only when one was resolved: a silent caller means the
    // user's own ~/.grok/config.toml default applies, and this plugin does not
    // second-guess it.
    if (req.effort !== undefined) argv.push('--reasoning-effort', req.effort)
    // Sandbox is locked to the profile the session was created with;
    // restating a different one on `--resume` is a hard error.
    if (req.mode === 'new' && req.access === 'read-only') {
      argv.push('--sandbox', 'read-only', '--permission-mode', 'dontAsk')
    } else if (req.mode === 'new' && req.access === 'workspace-write') {
      argv.push('--sandbox', 'workspace', '--permission-mode', 'dontAsk')
    } else if (req.mode === 'new' && req.access === 'full-access') {
      argv.push('--sandbox', 'off', '--permission-mode', 'bypassPermissions')
    }
    return { argv, stdin: null, env: {} }
  },

  translate(native: unknown, state: GrokState): HarnessEvent[] {
    if (!isRecord(native)) return []
    const type = native['type']

    if (type === 'text') {
      const text = readString(native, 'data')
      if (text !== undefined) {
        // Grok's text frames are deltas, so they accumulate.
        state.text += text
        return [{ kind: 'text', text }]
      }
    } else if (type === 'thought') {
      /*
       * Reasoning, and it arrives ONE TOKEN PER FRAME
       * (`{"type":"thought","data":"The"}`). Two consequences the previous
       * fall-through got wrong: the token itself was dropped (the note carried
       * only the word "thought"), and a normal reasoning block spent thousands
       * of ring-buffer slots on content-free notes, evicting the session, reply,
       * and error events. Emitting it as `reasoning` both keeps the content and
       * lets the store fold adjacent deltas into one event.
       */
      const text = readString(native, 'data')
      if (text !== undefined) return [{ kind: 'reasoning', text }]
    } else if (type === 'available_commands') {
      /*
       * Dropped on purpose. It is a ~2KB static list of the CLI's own tools and
       * slash commands, re-announced 3+ times per run, identical every time. It
       * describes what grok CAN do, never anything this run DID, so the
       * "unrecognized frames still mark work" fallback does not apply: each copy
       * would only cost a retention slot and a line of the bounded digest the
       * model reads.
       */
      return []
    } else if (type === 'tool_call') {
      /*
       * Frame shape (observed on grok's streaming-json):
       * `{"type":"tool_call","toolCallId":"call-…","title":"read_file",
       *   "kind":"read","status":"pending","toolName":"read_file",
       *   "rawInput":{"target_file":"…"},"content":[],"locations":[]}`.
       * `input` is attached only when present: an own key with an `undefined`
       * value fails the Remote boundary's JSON validation.
       */
      const name = readString(native, 'toolName') ?? readString(native, 'title')
      if (name === undefined) return [{ kind: 'note', text: 'tool_call' }]
      const callId = readString(native, 'toolCallId')
      if (callId === undefined) return [missingCallId(`tool ${name} started`)]
      state.tools.set(callId, name)
      const input = native['rawInput']
      return [input === undefined
        ? { kind: 'tool_start', callId, name }
        : { kind: 'tool_start', callId, name, input }]
    } else if (type === 'tool_call_update') {
      /*
       * The settlement half of a tool call. Updates with `status: null` /
       * `in_progress` carry only locations/progress and are dropped; a
       * terminal status becomes the tool event's exit code, attributed
       * through the id→name table. Output lives on `content` (a text
       * wrapper) or `rawOutput` depending on the tool.
       */
      const status = readString(native, 'status')
      if (status !== 'completed' && status !== 'failed') return []
      const callId = readString(native, 'toolCallId')
      const name = (callId !== undefined ? state.tools.get(callId) : undefined) ?? 'tool'
      if (callId === undefined) return [missingCallId(`tool ${name} completed`)]
      const output = grokToolOutput(native)
      return [{
        kind: 'tool_finish',
        callId,
        name,
        ...(output !== undefined ? { output } : {}),
        exitCode: status === 'completed' ? 0 : 1,
      }]
    } else if (type === 'usage') {
      /*
       * Mid-run token accounting. The nested `usage` object is honest
       * about tokens; the accompanying `signature` must never reach a
       * timeline row. Cost/turns still come from the `end` frame.
       */
      const tokens = grokUsage(readRecord(native, 'usage') ?? native)
      return hasDefined(tokens) ? [{ kind: 'usage', ...tokens }] : []
    } else if (type === 'end') {
      // The closing frame is a verdict, not something to show: `finalize`
      // reads its session id and stop reason. Tokens/cost/model do become a
      // usage event so the footer can update before the run is marked done.
      state.end = native
      const usage = grokEndUsage(native)
      return hasDefined(usage) ? [{ kind: 'usage', ...usage }] : []
    } else if (type === 'error') {
      state.error = native
      const message = readString(native, 'message')
      return [{ kind: 'error', message: message !== undefined && message.trim() !== '' ? message : 'grok error' }]
    }

    return [{ kind: 'note', text: String(type) }]
  },

  finalize(state: GrokState, outcome: Outcome, info: RunInfo): RunResult {
    const errors: string[] = []

    if (info.timedOut) errors.push(`grok exceeded ${info.timeoutSeconds}s and was terminated`)
    const exit = exitFailure('grok', outcome)
    if (exit !== undefined) errors.push(exit)

    if (state.error !== undefined) {
      const message = readString(state.error, 'message')
      errors.push(`grok error: ${message !== undefined && message.trim() !== '' ? message : 'unknown'}`)
    } else if (state.end === undefined) {
      errors.push('missing grok end event')
    } else {
      // A different session id means this reply belongs to another
      // conversation — worse than no reply, because it would look valid.
      const sessionId = state.end['sessionId']
      if (sessionId !== info.sessionId) {
        errors.push(`end event session mismatch: expected ${info.sessionId}, got ${String(sessionId ?? 'missing')}`)
      }
      const stopReason = state.end['stopReason']
      if (stopReason !== 'EndTurn' && stopReason !== 'end_turn') {
        errors.push(`unexpected grok stop reason: ${String(stopReason ?? 'missing')}`)
      }
    }

    return {
      ok: errors.length === 0,
      text: state.text,
      // Grok runs on the caller-chosen id, so the requested one stands even
      // when the closing frame never arrived.
      sessionId: readString(state.end, 'sessionId') ?? info.sessionId,
      errors,
      // The closing frame accounts for the run: `"num_turns":1,
      // "total_cost_usd":0.00649026`. Reading it is what makes the card's cost
      // and turn lines say anything at all for this harness.
      extras: extrasFrom(grokEndUsage(state.end)),
    }
  },
}

function grokToolOutput(native: Record<string, unknown>): string | undefined {
  const raw = native['rawOutput']
  if (typeof raw === 'string') return raw
  if (isRecord(raw)) {
    const file = readRecord(raw, 'FileContent')
    const fileText = readString(file, 'content')
    if (fileText !== undefined) return fileText
    const nested = toolOutputText(raw)
    if (nested !== undefined) return nested
  }
  const content = native['content']
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const part of content) {
      if (!isRecord(part)) continue
      const inner = readRecord(part, 'content')
      const text = readString(inner, 'text') ?? readString(part, 'text')
      if (text !== undefined) parts.push(text)
    }
    if (parts.length > 0) return parts.join('')
  }
  return undefined
}

function grokModel(native: Record<string, unknown> | undefined): string | undefined {
  if (native === undefined) return undefined
  const usage = readRecord(native, 'modelUsage')
  if (usage !== undefined) {
    const first = Object.keys(usage)[0]
    if (first !== undefined) return first
  }
  return readString(native, 'model')
}

function grokUsage(source: Record<string, unknown> | undefined): {
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
} {
  if (source === undefined) return {}
  return {
    inputTokens: readNumber(source, 'input_tokens'),
    outputTokens: readNumber(source, 'output_tokens'),
    cachedTokens: readNumber(source, 'cache_read_input_tokens'),
    reasoningTokens: readNumber(source, 'reasoning_tokens'),
    model: grokModel(source),
  }
}

function grokEndUsage(native: Record<string, unknown> | undefined): {
  costUsd?: number
  turns?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
} {
  if (native === undefined) return {}
  const nested = grokUsage(readRecord(native, 'usage') ?? native)
  return {
    costUsd: readNumber(native, 'total_cost_usd'),
    turns: readNumber(native, 'num_turns'),
    ...nested,
    model: grokModel(native) ?? nested.model,
  }
}

function extrasFrom(usage: {
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

function hasDefined(value: Record<string, unknown>): boolean {
  return Object.values(value).some(entry => entry !== undefined)
}
