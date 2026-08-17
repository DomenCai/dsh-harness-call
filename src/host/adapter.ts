/**
 * The adapter contract: everything that differs between external harnesses.
 *
 * One adapter owns exactly one CLI. It knows how to spell a run as argv/stdin/
 * env, how to fold that CLI's native JSONL vocabulary into normalized
 * {@link HarnessEvent}s, and how to classify the finished process. It knows
 * nothing about ring buffers, sequence numbers, timers, the tool schema, or
 * the browser — the orchestrator in ./runs.ts owns all of that, so adding a
 * harness is one file plus one roster entry.
 *
 * @module dsh-harness-call/host/adapter
 */

import type { SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import type { HarnessEvent, RunMode } from '../shared/events.ts'
import type { HarnessKey } from '../shared/harness.ts'

/** Exit facts of the closed child process, as the subprocess seam reports them. */
export type Outcome = SubprocessOutcome

/** Everything an adapter needs to spell one run. */
export interface RunRequest {
  /** The self-contained prompt handed to the external agent. */
  readonly prompt: string
  /** Absolute working directory for the child process. */
  readonly cwd: string
  /** Whether to open a fresh harness session or continue `sessionId`. */
  readonly mode: RunMode
  /**
   * The session id to use: a caller-chosen new id when `mode` is `new`, or the
   * id to continue when `mode` is `resume`. Never null — the orchestrator
   * generates one rather than letting a harness pick silently.
   */
  readonly sessionId: string
  /**
   * Sandbox policy for harnesses that take one at session creation. Only
   * `codex` reads it today, and only for a new session: a resumed session
   * keeps the sandbox and writable roots it was created with.
   */
  readonly sandbox: 'read-only' | 'workspace-write'
  /** Deadline in seconds, already clamped by the orchestrator. */
  readonly timeoutSeconds: number
}

/** The native invocation an adapter asks for. */
export interface SpawnSpec {
  /** Arguments AFTER the executable; the orchestrator prepends the resolved bin. */
  readonly argv: string[]
  /** Text written to the child's stdin, or `null` to give it no stdin at all. */
  readonly stdin: string | null
  /**
   * Environment entries layered onto the subprocess seam's scrubbed parent
   * env. A string sets the variable; **`undefined` is a tombstone that removes
   * an inherited one** — the claude adapter depends on this to stop a host's
   * short-lived gateway credentials from reaching a CLI that must use its own
   * credential store.
   */
  readonly env: Record<string, string | undefined>
}

/**
 * Mutable state an adapter folds one run into.
 *
 * Only the one field every harness needs lives here. Each adapter extends this
 * with whatever its own protocol requires (claude's terminal `result` event,
 * codex's `thread_id`/`turn.completed`, grok's `end` frame) and declares that
 * extension as its own `S`, so those fields are private to the adapter and
 * fully typed inside it instead of being duck-typed onto a shared bag.
 */
export interface RunState {
  /** Reply text accumulated so far; `finalize` may replace it with the authoritative one. */
  text: string
}

/** Orchestrator-owned facts `finalize` needs but cannot observe itself. */
export interface RunInfo {
  /** The deadline fired and the process was terminated. */
  readonly timedOut: boolean
  /** The deadline that was in force, for the message. */
  readonly timeoutSeconds: number
  /** The session id the run requested, to compare against what the harness reports. */
  readonly sessionId: string
  /** The caller cancelled (tool `exec.signal` aborted). */
  readonly aborted: boolean
}

/** An adapter's verdict on one finished run. */
export interface RunResult {
  /** Whether the run is considered successful; must be false when `errors` is non-empty. */
  readonly ok: boolean
  /** The authoritative final reply text. */
  readonly text: string
  /** The session id to remember for the next auto-continue, or `null` if none. */
  readonly sessionId: string | null
  /** Human-readable failure reasons; empty on success. */
  readonly errors: readonly string[]
  /** Optional accounting the harness reported. */
  readonly extras: { readonly costUsd?: number, readonly numTurns?: number }
}

/**
 * One external harness.
 *
 * @template S - this adapter's private run state. The registry stores adapters
 * as `HarnessAdapter` (`S = RunState`); TypeScript's method-parameter
 * bivariance makes each concrete adapter assignable there, so the orchestrator
 * can drive any adapter without a cast and without ever naming — or touching —
 * the private fields.
 */
export interface HarnessAdapter<S extends RunState = RunState> {
  /** Roster key; must match the {@link HarnessKey} this adapter serves. */
  readonly key: HarnessKey
  /** Human-facing name, mirrored into every {@link RunSummary}. */
  readonly label: string
  /** Executable name resolved through PATH. */
  readonly bin: string
  /** Fresh state for one run; the adapter's only chance to seed private fields. */
  createState(): S
  /** Spell one run as a native invocation. */
  build(req: RunRequest): SpawnSpec
  /**
   * Translate one native JSONL event into 0..n normalized events, folding
   * anything durable into `state`.
   *
   * Translation only: no truncation, no sequence numbers, no timestamps, no
   * display decisions. The store assigns `seq`/`at` and enforces its own
   * retention, so an adapter that drops or shortens events here would corrupt
   * counts it cannot see.
   *
   * @param native - one parsed JSONL line, entirely untrusted.
   * @param state - this run's fold state, mutated in place.
   * @returns normalized events in the order they occurred; empty is normal.
   */
  translate(native: unknown, state: S): HarnessEvent[]
  /** Classify the closed process into the shared result shape. */
  finalize(state: S, outcome: Outcome, info: RunInfo): RunResult
}

/** The adapter table, keyed by roster key and total over it. */
export type HarnessAdapterRegistry = Readonly<Record<HarnessKey, HarnessAdapter>>
