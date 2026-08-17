/**
 * Normalized run/event contract shared by the host and browser halves.
 *
 * ZERO RUNTIME DEPENDENCIES BY DESIGN. This file is compiled by both tsc
 * programs (host and client). Importing any `@deepseek-ai` package here would
 * drag that package's `declare module '@deepseek-ai/cordis'` augmentation into
 * whichever program picks it up, and the host and browser runtimes merge
 * different members onto the same `Context` — so the two programs would start
 * disagreeing about a type neither of them declared. Pure types and
 * dependency-free constants only.
 *
 * @module dsh-harness-call/shared/events
 */

/**
 * One normalized event produced by an external harness run. Every adapter
 * translates its own native JSONL vocabulary into this single shape, so the
 * store, the tool result, and the browser timeline all speak one language and
 * a new harness needs no UI change.
 */
export type HarnessEvent =
  /** The harness reported the session id this run reads/writes. */
  | { kind: 'session', sessionId: string }
  /** Model thinking / reasoning text, shown de-emphasized. */
  | { kind: 'reasoning', text: string }
  /** Assistant-visible reply text (a delta, not the accumulated whole). */
  | { kind: 'text', text: string }
  /** A tool/command invocation; `exitCode` is present once it has settled. */
  | { kind: 'tool', name: string, input?: unknown, exitCode?: number }
  /** A workspace file the harness created, edited, or deleted. */
  | { kind: 'file', path: string, change: 'create' | 'edit' | 'delete' }
  /** A run-level error the harness reported (not necessarily fatal). */
  | { kind: 'error', message: string }
  /** Billing/turn accounting reported at the end of a run. */
  | { kind: 'usage', costUsd?: number, turns?: number }
  /** Anything worth showing that has no richer normalized shape yet. */
  | { kind: 'note', text: string }

/** Discriminant of {@link HarnessEvent}. */
export type HarnessEventKind = HarnessEvent['kind']

/**
 * A {@link HarnessEvent} after the store has accepted it.
 *
 * `seq` is assigned by the store, is monotonically increasing across the whole
 * run, and never restarts — a client that has seen `seq` asks for everything
 * after it. `at` is milliseconds since the run started (not a wall clock), so
 * a replayed timeline reads the same regardless of when it is viewed.
 */
export type StoredEvent = HarnessEvent & { seq: number, at: number }

/**
 * Lifecycle of one run. `starting` covers argv/executable resolution before
 * the child process exists; `running` means the process is alive; `done` is
 * terminal and covers success, failure, timeout, and cancellation alike.
 */
export type RunPhase = 'starting' | 'running' | 'done'

/** Whether this run opened a fresh harness session or continued one. */
export type RunMode = 'new' | 'resume'

/**
 * Event-free summary of one run — what the roster/list surface needs. Kept
 * separate from {@link RunDetail} so listing every run does not ship every
 * run's timeline.
 */
export interface RunSummary {
  /** Store-assigned identity of this run, stable for its whole lifetime. */
  runId: string
  /** Adapter key that produced it (`claude` / `codex` / `grok`). */
  harness: string
  /**
   * The model tool call this run serves (`exec.callId`), when the host could
   * observe one. It is how a still-running card finds ITS run: the tool result
   * carries `runId`, but a card that has not settled yet has only the call it
   * was rendered for. Optional because the correlation is best-effort — a
   * client that cannot read a call id falls back to the newest run of the same
   * harness, which is the granularity this plugin had before runs were keyed.
   */
  callId?: string
  /** Human-facing harness name, so the browser needs no key→label table. */
  label: string
  phase: RunPhase
  mode: RunMode
  /**
   * Session the run is bound to: the requested id while starting, the
   * harness-confirmed id once it reports one, and `null` when the harness
   * never reported one.
   */
  sessionId: string | null
  /** Working directory the child process was spawned in. */
  cwd: string
  /** Truncated prompt, safe to render in a card without unbounded growth. */
  promptPreview: string
  /** Length of the untruncated prompt, so the UI can say how much was cut. */
  promptCharacters: number
  /** Wall-clock epoch ms when the run started; the sort key for listings. */
  startedAt: number
  /** Wall-clock epoch ms when the run reached `done`. */
  finishedAt?: number
  /** Total run duration in ms, present once finished. */
  elapsedMs?: number
  /** Whether the finished run is considered successful; absent until `done`. */
  ok?: boolean
  /** Human-readable failure reasons; empty on success. */
  errors: readonly string[]
  /**
   * Every event the run has produced, INCLUDING ones the ring buffer has
   * already evicted. Equals the highest assigned `seq`.
   */
  eventCount: number
  /**
   * How many events the ring buffer dropped. Reported rather than silently
   * truncated so a UI can say "earlier events discarded" instead of showing a
   * timeline that quietly starts in the middle.
   */
  droppedEvents: number
  /** Kind of the most recent event, for a one-glance "what is it doing" line. */
  lastEventKind?: HarnessEventKind
  /** Reported cost in USD, when the harness accounts for it. */
  costUsd?: number
  /** Reported assistant turns, when the harness accounts for them. */
  turns?: number
}

/**
 * One run's summary plus an incremental slice of its timeline: the response to
 * a `get(runId, sinceSeq)` poll.
 */
export interface RunDetail {
  summary: RunSummary
  /** Retained events with `seq > sinceSeq`, in ascending `seq` order. */
  events: readonly StoredEvent[]
  /**
   * Highest `seq` the store currently holds. The client passes this back as
   * the next `sinceSeq`; it is NOT `events[events.length - 1].seq`, which
   * would stall a poll that returned no new events.
   */
  cursor: number
  /**
   * Reply text: the accumulated deltas while running, replaced by the
   * harness's authoritative final reply once the run finishes.
   */
  text: string
}
