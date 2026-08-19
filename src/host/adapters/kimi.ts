/**
 * Kimi Code adapter: `kimi -p <prompt> --output-format stream-json`.
 *
 * Session handling: kimi names the session itself (`session_<uuid>`) and
 * announces it in the closing `session.resume_hint` frame — a new run cannot
 * be given an id (verified: `-S <fresh-id>` fails with "Session not found"),
 * so the caller-chosen id in {@link RunRequest} is ignored for `mode: 'new'`.
 * `--session <id>` continues one.
 *
 * Like grok, the prompt is an argument, not stdin, so this adapter spawns
 * with no stdin at all.
 *
 * Policy mapping: `req.effort` becomes the `KIMI_MODEL_THINKING_EFFORT` env
 * var (verified: an invalid value reaches the API and fails the run, so the
 * variable is genuinely plumbed through). `req.access` is deliberately NOT
 * read: kimi-code's prompt mode rejects every permission flag (`-p` cannot
 * combine with `--yolo` / `--auto` / `--plan`, and `--permission` is not a
 * CLI option), so a headless run always inherits `default_permission_mode`
 * from ~/.kimi-code/config.toml. See HARNESS_CAPABILITIES in
 * ../../shared/policy.ts — the settings page greys the field out.
 *
 * @module dsh-harness-call/host/adapters/kimi
 */

import { HARNESS_LABELS } from '../../shared/harness.js'
import type { HarnessEvent } from '../../shared/events.js'
import type { HarnessAdapter, Outcome, RunInfo, RunRequest, RunResult, RunState, SpawnSpec } from '../adapter.js'
import { exitFailure, isRecord, readRecord, readString } from './native.js'

/**
 * Kimi ships a whole assistant message per frame (never deltas), splits tool
 * calls into `tool_calls` on the assistant frame and their results into
 * `role: "tool"` frames, and closes with one `meta` / `session.resume_hint`
 * frame carrying the session id. `finalize` treats a missing resume hint as
 * a failure: it is the only frame that proves the run ended normally and the
 * only source of the session id a later resume needs.
 */
export interface KimiState extends RunState {
  /** The terminal `session.resume_hint` frame, once seen. */
  resumeHint?: Record<string, unknown>
  /**
   * `tool_call_id` → tool name, so a `role: "tool"` result frame (which
   * carries no name of its own) can be attributed to the call that spawned it.
   */
  tools: Map<string, string>
}

/**
 * The `input` for one tool call. kimi's `function.arguments` is a JSON
 * STRING, not an object — parsed when possible so the panel can expand it,
 * passed through raw when it is not valid JSON.
 */
function toolInput(args: string | undefined): unknown {
  if (args === undefined) return undefined
  try {
    return JSON.parse(args)
  } catch {
    return args
  }
}

export const kimiAdapter: HarnessAdapter<KimiState> = {
  key: 'kimi',
  label: HARNESS_LABELS.kimi,
  bin: 'kimi',

  createState(): KimiState {
    return { text: '', tools: new Map() }
  },

  build(req: RunRequest): SpawnSpec {
    // The prompt travels as an argument: this CLI takes no stdin, so the
    // spawn asks for none at all rather than handing it an empty pipe.
    const argv = ['-p', req.prompt, '--output-format', 'stream-json']
    if (req.mode === 'resume') argv.push('--session', req.sessionId)
    return {
      argv,
      stdin: null,
      env: req.effort !== undefined ? { KIMI_MODEL_THINKING_EFFORT: req.effort } : {},
    }
  },

  translate(native: unknown, state: KimiState): HarnessEvent[] {
    if (!isRecord(native)) return []
    const role = native['role']

    if (role === 'assistant') {
      const events: HarnessEvent[] = []
      const text = readString(native, 'content')
      if (text !== undefined && text.trim() !== '') {
        /*
         * One frame carries a whole message, and one run can contain SEVERAL
         * of them (one per assistant turn). The store's `text` event is
         * contractually a DELTA — same argument as the codex adapter — so the
         * separator rides along with the piece to keep the live panel
         * byte-identical to the authoritative final text.
         */
        const piece = state.text === '' ? text : `\n\n${text}`
        state.text += piece
        events.push({ kind: 'text', text: piece })
      }
      const calls = native['tool_calls']
      if (Array.isArray(calls)) {
        for (const call of calls) {
          if (!isRecord(call)) continue
          const fn = readRecord(call, 'function')
          const name = readString(fn, 'name') ?? readString(call, 'name')
          if (name === undefined) {
            events.push({ kind: 'note', text: 'tool_call' })
            continue
          }
          const callId = readString(call, 'id')
          if (callId !== undefined) state.tools.set(callId, name)
          const input = toolInput(readString(fn, 'arguments'))
          events.push(input === undefined ? { kind: 'tool', name } : { kind: 'tool', name, input })
        }
      }
      return events
    }

    if (role === 'tool') {
      /*
       * The settlement half of a tool call. kimi's frame carries the output
       * but no status and no name; reaching it at all means the call finished,
       * so the exit code is 0, attributed through the id→name table.
       */
      const callId = readString(native, 'tool_call_id')
      const name = (callId !== undefined ? state.tools.get(callId) : undefined) ?? 'tool'
      return [{ kind: 'tool', name, exitCode: 0 }]
    }

    if (role === 'meta') {
      if (native['type'] === 'session.resume_hint') {
        state.resumeHint = native
        const sessionId = readString(native, 'session_id')
        return sessionId === undefined ? [] : [{ kind: 'session', sessionId }]
      }
      // Other meta frames are bookkeeping, not work this run did.
      return []
    }

    return [{ kind: 'note', text: String(role ?? native['type'] ?? 'frame') }]
  },

  finalize(state: KimiState, outcome: Outcome, info: RunInfo): RunResult {
    const errors: string[] = []

    if (info.timedOut) errors.push(`kimi exceeded ${info.timeoutSeconds}s and was terminated`)
    const exit = exitFailure('kimi', outcome)
    if (exit !== undefined) errors.push(exit)

    if (state.resumeHint === undefined) {
      errors.push('missing kimi session.resume_hint event')
    } else if (readString(state.resumeHint, 'session_id') === undefined) {
      errors.push('kimi session.resume_hint event has no session_id')
    }

    return {
      ok: errors.length === 0,
      text: state.text,
      // kimi names the session itself, so only the stream's id is ever
      // returned — NEVER `info.sessionId`, which kimi does not know and a
      // later `--session` would fail on.
      sessionId: readString(state.resumeHint, 'session_id') ?? null,
      errors,
      // kimi's stream-json accounts for nothing: no cost, no turn count.
      extras: {},
    }
  },
}
