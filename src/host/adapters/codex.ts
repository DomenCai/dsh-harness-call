/**
 * Codex CLI adapter: `codex exec --json`.
 *
 * Session handling: Codex names the session itself and announces it in
 * `thread.started`, so a new run cannot be given an id; `exec resume <id>`
 * continues one. A resumed run also keeps the sandbox and writable roots it
 * was created with, which is why `--sandbox` is a new-session-only flag.
 *
 * @module dsh-harness-call/host/adapters/codex
 */

import { HARNESS_LABELS } from '../../shared/harness.js'
import type { HarnessEvent } from '../../shared/events.js'
import type { HarnessAdapter, Outcome, RunInfo, RunRequest, RunResult, RunState, SpawnSpec } from '../adapter.js'
import { exitFailure, hasDefined, isRecord, missingCallId, readNumber, readRecord, readString } from './native.js'

/** Longest failure message folded into {@link RunResult.errors}. */
const MAX_ERROR_CHARACTERS = 160

/**
 * Codex signals success structurally rather than in one payload: the thread id
 * arrives in `thread.started`, the reply in an `agent_message` item, and the
 * verdict in `turn.completed` / `turn.failed`. All four are tracked because a
 * run missing any of them is not a success.
 */
export interface CodexState extends RunState {
  /** Thread id from `thread.started`; Codex's session identity. */
  sessionId?: string
  /** A `turn.completed` event was seen. */
  completed?: boolean
  /** The `turn.failed` event, once seen. */
  failed?: Record<string, unknown>
  /** Token/model accounting from `turn.completed` / `token_count`. */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cachedTokens?: number
    reasoningTokens?: number
    model?: string
  }
  /**
   * Item ids already announced via `item.started`. A single-frame tool
   * (web_search, …) only appears as `item.completed`; those synthesize a
   * start+finish pair in the same tick so the client still gets a card.
   */
  started: Set<string>
}

/**
 * Collapse a harness failure message to one bounded line.
 *
 * The only shortening left in any adapter, and deliberate: this string lands
 * in `RunResult.errors`, which is data the model reads back, not a timeline
 * entry a panel can expand. An unbounded stack trace there would crowd out the
 * reply it is supposed to explain.
 */
function briefMessage(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > MAX_ERROR_CHARACTERS ? `${text.slice(0, MAX_ERROR_CHARACTERS)}…` : text
}

export const codexAdapter: HarnessAdapter<CodexState> = {
  key: 'codex',
  label: HARNESS_LABELS.codex,
  bin: 'codex',

  createState(): CodexState {
    return { text: '', started: new Set() }
  },

  build(req: RunRequest): SpawnSpec {
    if (req.mode === 'resume') {
      // No sandbox flag: a resumed session retains the sandbox and writable
      // roots it was created with, and passing a different one would be a lie.
      // Effort can still be restated: `-c` is a process override, not a
      // session-creation lock.
      const argv = ['exec', 'resume', '--json', req.sessionId, '-']
      if (req.effort !== undefined) argv.splice(3, 0, '-c', `model_reasoning_effort="${req.effort}"`)
      return { argv, stdin: req.prompt, env: {} }
    }
    // A missing access (settings = model, no tool override) still defaults
    // to read-only: that is the historical contract for a new Codex session.
    const sandbox = req.access === 'full-access'
      ? 'danger-full-access'
      : req.access === 'workspace-write'
        ? 'workspace-write'
        : 'read-only'
    const argv = ['exec', '--json', '--sandbox', sandbox, '--skip-git-repo-check', '--cd', req.cwd]
    if (req.access === 'full-access') argv.push('--dangerously-bypass-approvals-and-sandbox')
    if (req.effort !== undefined) argv.splice(2, 0, '-c', `model_reasoning_effort="${req.effort}"`)
    argv.push('-')
    return { argv, stdin: req.prompt, env: {} }
  },

  translate(native: unknown, state: CodexState): HarnessEvent[] {
    if (!isRecord(native)) return []
    const type = native['type']

    if (type === 'thread.started') {
      const sessionId = readString(native, 'thread_id')
      if (sessionId === undefined) return []
      state.sessionId = sessionId
      return [{ kind: 'session', sessionId }]
    }

    if (type === 'item.started') {
      const item = readRecord(native, 'item')
      if (item === undefined) return []
      const started = toolStartFromItem(item)
      if (started === undefined) return []
      if (started.kind === 'tool_start') state.started.add(started.callId)
      return [started]
    }

    if (type === 'item.completed') {
      const item = readRecord(native, 'item')
      if (item === undefined) return []
      const itemType = item['type']

      if (itemType === 'agent_message') {
        const text = readString(item, 'text')
        if (text !== undefined) {
          /*
           * Codex ships a whole message per item, but one turn can complete
           * SEVERAL of them (a plan, then the report after the work) — observed
           * on 0.144.5. The store's `text` event is contractually a DELTA, so
           * the piece emitted here is what gets appended, and every message is
           * kept.
           *
           * Deliberate change from the old JS, which assigned instead of
           * appended: assigning made the live panel (which accumulates deltas)
           * and the final text (which was only the LAST message) disagree, so a
           * second message made the already-displayed reply visibly shrink, and
           * the model was handed a reply with the earlier message missing.
           * Emitting the separator as part of the delta is what keeps the live
           * view byte-identical to the authoritative final text.
           */
          const piece = state.text === '' ? text : `\n\n${text}`
          state.text += piece
          return [{ kind: 'text', text: piece }]
        }
      } else if (itemType === 'reasoning') {
        const text = readString(item, 'text')
        if (text !== undefined && text.trim() !== '') return [{ kind: 'reasoning', text }]
      } else if (itemType === 'command_execution' || itemType === 'web_search' || isToolItem(itemType)) {
        return toolFinishFromItem(state, item, typeof itemType === 'string' ? itemType : 'tool')
      } else if (itemType === 'file_change') {
        const changes = fileChanges(item)
        /*
         * The fallback stringifies the WHOLE item, matching what the old JS's
         * `brief(item.path ?? item, 100)` produced: `file_change` carries no
         * flat `path`, so that expression always fell through to the item and the
         * paths stayed visible. A note that says only `file_change` would be a
         * regression against it, so an unreadable shape still shows everything
         * the harness sent.
         */
        return changes.length > 0
          ? changes
          : [{ kind: 'note', text: `file_change ${JSON.stringify(item)}` }]
      } else if (itemType === 'error') {
        const message = readString(item, 'message')
        /*
         * Reported, NOT counted against the run. Deliberate change from the old
         * JS, which pushed every one of these into the final error list.
         *
         * Codex uses an `error` item for advisory warnings, not just failures —
         * 0.144.5 opens every run whose config enables an unstable feature with
         * `{"type":"error","message":"Under-development features enabled: …"}`
         * and then completes the turn normally. Failing the run on it was wrong
         * three times over: the model got "failed" alongside a perfectly good
         * reply, the card showed a red run that had succeeded, and — worst —
         * `tool.ts` only remembers a session id from a SUCCESSFUL run, so codex
         * auto-continue was permanently dead on such a machine and every call
         * silently opened a new thread.
         *
         * Success is now decided only by facts that actually mean failure:
         * `turn.failed`, a missing `turn.completed`, a missing agent message, a
         * non-zero exit, or the deadline.
         */
        if (message !== undefined) return [{ kind: 'error', message }]
      }

      // Unrecognized (or malformed) items still mark work the run did; dropping
      // them would read as an idle gap in the timeline.
      return [{ kind: 'note', text: String(itemType) }]
    }

    if (type === 'turn.completed') {
      state.completed = true
      const usage = readRecord(native, 'usage')
      const tokens = readCodexUsage(usage, native)
      if (hasDefined(tokens)) state.usage = { ...state.usage, ...tokens }
      return hasDefined(tokens) ? [{ kind: 'usage', ...tokens }] : []
    }

    if (type === 'token_count' || type === 'event.token_count') {
      const tokens = readCodexUsage(readRecord(native, 'usage') ?? native, native)
      if (!hasDefined(tokens)) return []
      state.usage = { ...state.usage, ...tokens }
      return [{ kind: 'usage', ...tokens }]
    }

    if (type === 'turn.failed') {
      state.failed = native
      return []
    }

    return []
  },

  finalize(state: CodexState, outcome: Outcome, info: RunInfo): RunResult {
    const errors: string[] = []

    if (info.timedOut) errors.push(`codex exceeded ${info.timeoutSeconds}s and was terminated`)
    const exit = exitFailure('codex', outcome)
    if (exit !== undefined) errors.push(exit)

    if (state.sessionId === undefined) errors.push('missing codex thread.started event')
    if (state.failed !== undefined) {
      const message = readString(readRecord(state.failed, 'error'), 'message')
      errors.push(`codex turn failed: ${briefMessage(message === undefined || message === '' ? 'unknown' : message)}`)
    }
    if (state.completed !== true) errors.push('missing codex turn.completed event')
    if (state.text === '') errors.push('missing codex agent message')

    return {
      ok: errors.length === 0,
      text: state.text,
      sessionId: state.sessionId ?? null,
      errors,
      // Nothing to report: codex's `turn.completed` usage block accounts in
      // tokens (`input_tokens` / `cached_input_tokens` / `output_tokens` /
      // `reasoning_output_tokens`) and names neither a cost nor a turn count,
      // and `extras` has no token field to carry them honestly.
      extras: {
        inputTokens: state.usage?.inputTokens,
        outputTokens: state.usage?.outputTokens,
        cachedTokens: state.usage?.cachedTokens,
        reasoningTokens: state.usage?.reasoningTokens,
        model: state.usage?.model,
      },
    }
  },
}

function isToolItem(itemType: unknown): boolean {
  return itemType === 'mcp_tool_call' || itemType === 'tool' || itemType === 'function_call'
}

function toolStartFromItem(item: Record<string, unknown>): HarnessEvent | undefined {
  const itemType = item['type']
  if (itemType === 'command_execution') {
    const callId = readString(item, 'id')
    const command = item['command']
    if (callId === undefined) return missingCallId('tool command_execution started')
    return command === undefined
      ? { kind: 'tool_start', callId, name: 'command_execution' }
      : { kind: 'tool_start', callId, name: 'command_execution', input: command }
  }
  if (itemType === 'web_search') {
    const callId = readString(item, 'id')
    const query = item['query']
    if (callId === undefined) return missingCallId('tool web_search started')
    return query === undefined
      ? { kind: 'tool_start', callId, name: 'web_search' }
      : { kind: 'tool_start', callId, name: 'web_search', input: query }
  }
  if (!isToolItem(itemType)) return undefined
  const name = readString(item, 'name') ?? (typeof itemType === 'string' ? itemType : 'tool')
  const callId = readString(item, 'id') ?? readString(item, 'call_id')
  if (callId === undefined) return missingCallId(`tool ${name} started`)
  const input = item['input'] ?? item['arguments']
  return input === undefined
    ? { kind: 'tool_start', callId, name }
    : { kind: 'tool_start', callId, name, input }
}

function toolFinishFromItem(state: CodexState, item: Record<string, unknown>, fallbackName: string): HarnessEvent[] {
  const name = fallbackName === 'command_execution'
    ? 'command_execution'
    : fallbackName === 'web_search'
      ? 'web_search'
      : (readString(item, 'name') ?? fallbackName)
  const callId = readString(item, 'id') ?? readString(item, 'call_id')
  if (callId === undefined) return [missingCallId(`tool ${name} completed`)]
  const output = fallbackName === 'command_execution'
    ? readString(item, 'aggregated_output')
    : (readString(item, 'output') ?? readString(item, 'aggregated_output'))
  const exitCode = readNumber(item, 'exit_code')
  const failed = (exitCode !== undefined && exitCode !== 0) || readString(item, 'status') === 'failed'
  const finish: HarnessEvent = {
    kind: 'tool_finish',
    callId,
    name,
    ...(output !== undefined ? { output } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(failed ? { failed: true as const } : {}),
  }
  if (state.started.has(callId)) return [finish]
  const input = fallbackName === 'command_execution'
    ? item['command']
    : fallbackName === 'web_search'
      ? item['query']
      : (item['input'] ?? item['arguments'] ?? item['query'])
  const start: HarnessEvent = input === undefined
    ? { kind: 'tool_start', callId, name }
    : { kind: 'tool_start', callId, name, input }
  state.started.add(callId)
  return [start, finish]
}

function readCodexUsage(source: Record<string, unknown> | undefined, native: Record<string, unknown>): {
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
} {
  const from = source ?? native
  return {
    inputTokens: readNumber(from, 'input_tokens'),
    outputTokens: readNumber(from, 'output_tokens'),
    cachedTokens: readNumber(from, 'cached_input_tokens') ?? readNumber(from, 'cached_tokens'),
    reasoningTokens: readNumber(from, 'reasoning_output_tokens') ?? readNumber(from, 'reasoning_tokens'),
    model: readString(from, 'model') ?? readString(native, 'model'),
  }
}

/**
 * The `file` events one `file_change` item describes.
 *
 * Shape confirmed against codex 0.144.5, which emits
 * `"changes":[{"path":"…","kind":"add"}]` — an array, no flat `path`, and the
 * verb spelled `add` / `update` / `delete`. Entries that do not carry both a
 * path and a recognized verb are skipped rather than guessed at, which is what
 * makes the caller's whole-item fallback the honest answer for a shape this
 * cannot read.
 */
function fileChanges(item: Record<string, unknown>): HarnessEvent[] {
  const changes = item['changes']
  if (!Array.isArray(changes)) return []
  const events: HarnessEvent[] = []
  for (const entry of changes) {
    const path = readString(entry, 'path')
    const change = changeVerb(readString(entry, 'kind'))
    if (path === undefined || change === undefined) continue
    events.push({ kind: 'file', path, change })
  }
  return events
}

/** Codex's change verb in the normalized vocabulary, or `undefined` if unknown. */
function changeVerb(kind: string | undefined): 'create' | 'edit' | 'delete' | undefined {
  if (kind === 'add') return 'create'
  if (kind === 'update') return 'edit'
  if (kind === 'delete') return 'delete'
  return undefined
}
