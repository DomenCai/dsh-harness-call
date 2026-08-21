/**
 * In-memory store of harness runs: the single source of truth the tool writes
 * and the browser reads.
 *
 * It owns everything the adapters deliberately do not: run identity, event
 * sequencing and relative timestamps, the bounded retention window, the
 * accumulated reply text, and projection into the shared {@link RunSummary} /
 * {@link RunDetail} shapes.
 *
 * Retention is a per-run ring buffer. When it evicts, the eviction is counted
 * into `droppedEvents` and `seq` keeps climbing, so a client can tell "nothing
 * new" from "you missed some" — a silently truncated timeline would read as a
 * run that simply did less work. Adjacent same-kind reply/reasoning deltas are
 * folded together before they can consume a slot, so the window measures work
 * rather than tokens; {@link mergeDelta} states the sequencing invariant that
 * makes the fold invisible to an incrementally polling client.
 *
 * State is process-lifetime only: runs describe live external processes, and a
 * run that outlives the harness process has nothing left to poll.
 *
 * @module dsh-harness-call/host/runs
 */

import type {
  HarnessEvent,
  HarnessEventKind,
  RunDetail,
  RunPhase,
  RunSummary,
  StoredEvent,
} from '../shared/events.js'
import type { RunResult } from './adapter.js'
import { DEFAULT_MAX_TOOL_OUTPUT_BYTES, truncateHeadTail } from './truncate.js'

/** Bounds that keep an unattended session from growing without limit. */
export interface RunStoreOptions {
  /** Events retained per run before the ring buffer starts evicting. */
  readonly maxEventsPerRun: number
  /** Runs retained before the oldest finished one is discarded. */
  readonly maxRuns: number
  /** Length of {@link RunSummary.promptPreview}. */
  readonly promptPreviewCharacters: number
}

/** What identifies a run at the moment it is opened. */
export interface RunOpenSpec {
  readonly harness: string
  readonly label: string
  readonly mode: RunSummary['mode']
  /** Requested id for caller-named sessions, or null until the harness reports one. */
  readonly sessionId: string | null
  readonly cwd: string
  /** The full prompt; the store keeps only a preview plus its length. */
  readonly prompt: string
  /** The model tool call this run serves; see {@link RunSummary.callId}. */
  readonly callId?: string
}

/**
 * Write surface for one open run, handed to the orchestrator so it never
 * re-looks-up a run id or has to handle a "run vanished" branch.
 */
export interface RunHandle {
  readonly runId: string
  /** The child process is alive: `starting` → `running`. */
  markRunning(): void
  /**
   * Record normalized events, assigning `seq` and `at`. Accepts a batch
   * because one native line can translate to several events and they must be
   * numbered together.
   */
  append(events: readonly HarnessEvent[]): void
  /** Terminal transition: `running` → `done`, applying the adapter's verdict. */
  finish(result: RunResult): void
}

/**
 * One run's mutable state. The handle closes over the record directly, so a
 * run the retention window has already dropped still accepts writes instead of
 * forcing the orchestrator to handle a "my run disappeared" branch — the writes
 * simply stop being observable, which is exactly what eviction means.
 */
interface RunRecord {
  readonly runId: string
  readonly harness: string
  readonly callId?: string
  readonly label: string
  readonly mode: RunSummary['mode']
  readonly cwd: string
  readonly promptPreview: string
  readonly promptCharacters: number
  readonly startedAt: number
  phase: RunPhase
  sessionId: string | null
  finishedAt?: number
  elapsedMs?: number
  ok?: boolean
  errors: string[]
  eventCount: number
  droppedEvents: number
  lastEventKind?: HarnessEventKind
  costUsd?: number
  turns?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
  /**
   * Reply text. While the run is live this accumulates `text` events; the
   * harnesses disagree about what a reply delta even is (codex replaces a whole
   * message, grok streams increments, claude emits blocks), and each adapter
   * resolves that disagreement into "append this piece" before the store sees
   * it. Accumulation is therefore a live approximation only — `finish` REPLACES
   * it with the adapter's authoritative final text, which is the one form every
   * harness can state exactly.
   */
  text: string
  /** Retained events, ascending `seq` and contiguous: evictions only ever drop the front. */
  readonly events: StoredEvent[]
  /**
   * Highest `seq` any `get` has already handed out for this run. Everything at
   * or below it is frozen — see {@link mergeDelta} for why that is the whole
   * safety condition for delta merging.
   */
  deliveredSeq: number
}

/**
 * Project the mutable record into a detached summary a poll can serialize safely.
 *
 * The Typert Gateway validates every result with `assertJsonValue`, which
 * rejects an own property whose VALUE is `undefined` — so the optional fields
 * are copied only when they are actually set. Spreading the record wholesale
 * would ship `finishedAt: undefined` for every live run and the gateway would
 * fail the whole `list()` call, leaving every card and panel staring at an
 * empty roster while the host holds the data.
 */
function toSummary(record: RunRecord): RunSummary {
  const summary: RunSummary = {
    runId: record.runId,
    harness: record.harness,
    label: record.label,
    phase: record.phase,
    mode: record.mode,
    sessionId: record.sessionId,
    cwd: record.cwd,
    promptPreview: record.promptPreview,
    promptCharacters: record.promptCharacters,
    startedAt: record.startedAt,
    errors: [...record.errors],
    eventCount: record.eventCount,
    droppedEvents: record.droppedEvents,
  }
  if (record.callId !== undefined) summary.callId = record.callId
  if (record.finishedAt !== undefined) summary.finishedAt = record.finishedAt
  if (record.elapsedMs !== undefined) summary.elapsedMs = record.elapsedMs
  if (record.ok !== undefined) summary.ok = record.ok
  if (record.lastEventKind !== undefined) summary.lastEventKind = record.lastEventKind
  if (record.costUsd !== undefined) summary.costUsd = record.costUsd
  if (record.turns !== undefined) summary.turns = record.turns
  if (record.inputTokens !== undefined) summary.inputTokens = record.inputTokens
  if (record.outputTokens !== undefined) summary.outputTokens = record.outputTokens
  if (record.cachedTokens !== undefined) summary.cachedTokens = record.cachedTokens
  if (record.reasoningTokens !== undefined) summary.reasoningTokens = record.reasoningTokens
  if (record.model !== undefined) summary.model = record.model
  return summary
}

/**
 * Copy one accepted event into its stored shape, keeping only DEFINED values.
 *
 * Adapters build sparse events by habit, and naming a key with an `undefined`
 * value is invisible to the
 * type system but fatal at the Remote boundary — same `assertJsonValue` rule
 * as {@link toSummary}. The store is the one chokepoint every event crosses,
 * so the guarantee is made here instead of in every adapter.
 */
function toStored(event: HarnessEvent, seq: number, at: number): StoredEvent {
  const stored: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (value !== undefined) stored[key] = value
  }
  if (event.kind === 'tool_finish' && typeof event.output === 'string') {
    // One cap, stated once: the browser annotates the card with the same
    // constant, so a store-side knob here would let the two drift apart.
    const truncated = truncateHeadTail(event.output, DEFAULT_MAX_TOOL_OUTPUT_BYTES)
    stored['output'] = truncated.text
    if (truncated.truncated) {
      stored['outputTruncated'] = true
      stored['outputOriginalBytes'] = truncated.originalBytes
    }
  }
  stored['seq'] = seq
  stored['at'] = at
  return stored as StoredEvent
}

export class RunStore {
  private readonly options: RunStoreOptions
  /**
   * Insertion-ordered, and insertion order IS `startedAt` order because ids are
   * handed out monotonically — so eviction can scan from the front for the
   * oldest finished run without sorting.
   */
  private readonly records = new Map<string, RunRecord>()
  private runCounter = 0

  constructor(options: RunStoreOptions) {
    this.options = options
  }

  /** Open a run and return its write surface. */
  open(spec: RunOpenSpec): RunHandle {
    // Process-local counter, not a UUID: run ids only have to be unique within
    // this process (nothing persists them) and readable in a log line.
    this.runCounter += 1
    const runId = `r${this.runCounter}`
    const record: RunRecord = {
      runId,
      harness: spec.harness,
      callId: spec.callId,
      label: spec.label,
      mode: spec.mode,
      cwd: spec.cwd,
      promptPreview: preview(spec.prompt, this.options.promptPreviewCharacters),
      promptCharacters: spec.prompt.length,
      startedAt: Date.now(),
      phase: 'starting',
      sessionId: spec.sessionId,
      errors: [],
      eventCount: 0,
      droppedEvents: 0,
      text: '',
      events: [],
      deliveredSeq: 0,
    }
    this.records.set(runId, record)
    this.evict()

    return {
      runId,
      markRunning: () => {
        record.phase = 'running'
      },
      append: (events) => {
        this.appendTo(record, events)
      },
      finish: (result) => {
        const finishedAt = Date.now()
        record.phase = 'done'
        record.ok = result.ok
        record.errors = [...result.errors]
        record.text = result.text
        record.sessionId = result.sessionId
        record.finishedAt = finishedAt
        record.elapsedMs = finishedAt - record.startedAt
        applyUsage(record, result.extras)
        // A finishing run is the moment a previously unevictable run becomes
        // evictable, so the bound converges even if no further run opens.
        this.evict()
      },
    }
  }

  /**
   * Every known run, newest first.
   *
   * `startedAt` is millisecond wall clock, so two runs opened in the same tick
   * — the normal case when the model fires several harness calls in parallel —
   * compare equal. `sort` is stable, which would then preserve the input order;
   * reversing the insertion order first therefore makes the tie break toward the
   * more recently opened run, so "newest first" holds for the whole list and not
   * just for runs that happened to land in different milliseconds. Insertion
   * order is the run counter's order, as the `records` doc states.
   */
  list(): RunSummary[] {
    return [...this.records.values()].reverse().sort((a, b) => b.startedAt - a.startedAt).map(toSummary)
  }

  /**
   * One run's summary plus its events after `sinceSeq`.
   * @returns `null` when the run id is unknown or has been evicted.
   */
  get(runId: string, sinceSeq: number): RunDetail | null {
    const record = this.records.get(runId)
    if (record === undefined) return null

    // Retained seqs are contiguous, so the slice start is arithmetic rather
    // than a scan. A cursor older than the window clamps to 0 and the client
    // gets everything still retained plus the `droppedEvents` count that
    // explains the gap.
    const oldest = record.events[0]
    const start =
      oldest === undefined
        ? 0
        : Math.min(record.events.length, Math.max(0, sinceSeq - oldest.seq + 1))

    // Everything retained is now in a caller's hands, so nothing retained may
    // change again. `Math.max` keeps the mark monotonic across several clients
    // polling the same run at different cursors: the highest mark wins, which
    // merges less rather than mutating an event some client already holds.
    record.deliveredSeq = Math.max(record.deliveredSeq, record.eventCount)

    return {
      summary: toSummary(record),
      events: record.events.slice(start),
      // The highest seq ASSIGNED, not the last one retained: a poll that
      // returned no new events must still advance the client past events the
      // ring buffer dropped, or the cursor would stall forever.
      cursor: record.eventCount,
      text: record.text,
    }
  }

  private appendTo(record: RunRecord, events: readonly HarnessEvent[]): void {
    const at = Date.now() - record.startedAt
    for (const event of events) {
      // A delta folded into the tail event consumes no `seq` and cannot evict,
      // so only a genuinely new event advances the counters. The per-event side
      // effects below still run either way: `record.text` accumulates the delta
      // regardless of which event carries it.
      if (!mergeDelta(record, event)) {
        record.eventCount += 1
        record.events.push(toStored(event, record.eventCount, at))
        if (record.events.length > this.options.maxEventsPerRun) {
          record.events.shift()
          record.droppedEvents += 1
        }
      }
      record.lastEventKind = event.kind

      switch (event.kind) {
        case 'session':
          // The harness confirmed which session this run actually reads/writes;
          // it may differ from the one the orchestrator requested.
          record.sessionId = event.sessionId
          break
        case 'text':
          record.text += event.text
          break
        case 'usage':
          applyUsage(record, event)
          break
        default:
          break
      }
    }
  }

  /**
   * Drop the oldest FINISHED runs until the roster fits. A live run is never a
   * candidate: it still has a handle writing into it, and evicting it would
   * make the browser's poll for a run that is visibly in progress return null.
   */
  private evict(): void {
    while (this.records.size > this.options.maxRuns) {
      let victim: string | undefined
      for (const [id, record] of this.records) {
        if (record.phase === 'done') {
          victim = id
          break
        }
      }
      if (victim === undefined) return
      this.records.delete(victim)
    }
  }
}

/**
 * Fold a `text`/`reasoning` delta into the retained tail event when that event
 * is still private to the store; report whether it did.
 *
 * WHY: the harnesses stream at wildly different granularity. Grok's
 * `streaming-json` emits ONE FRAME PER TOKEN (`{"type":"thought","data":"The"}`),
 * so one 3000-token reasoning block would consume 3000 ring-buffer slots and
 * evict every `session` / `text` / `error` event the 400-slot window exists to
 * keep — the window would be measuring tokens instead of work. Merging makes a
 * slot hold a semantic chunk again.
 *
 * THE INVARIANT IT MUST NOT BREAK: a client polls `get(runId, sinceSeq)`, keeps
 * every event it is handed, and thereafter only asks for `seq > sinceSeq`. So an
 * event a client already holds can never change — mutating one would leave that
 * client rendering stale text forever, and re-issuing the merged event under a
 * fresh `seq` (retiring the old one) would make the client append text it is
 * already displaying, showing the same prefix twice.
 *
 * So merging is permitted ONLY into an event no client has seen yet: `get`
 * raises `deliveredSeq` to the cursor it hands out, and the tail event may
 * absorb a delta only while its `seq` is beyond that mark. Sequence numbers are
 * therefore never reused, reassigned, or retired — a merged delta simply
 * consumes no number of its own, which keeps `eventCount` equal to the highest
 * `seq` assigned and keeps retained `seq`s contiguous for `get`'s arithmetic
 * slice.
 *
 * The price is that merging is bounded by poll cadence rather than by meaning: a
 * watched run starts a fresh event at every poll boundary, so the window holds
 * roughly one event per kind per poll rather than one per reply. That still
 * collapses per-token frames by orders of magnitude, and it is the only bound
 * that can never show a client text that disagrees with the host.
 *
 * The fold is an EXACT concatenation, never a join with a separator: the same
 * `text` deltas also accumulate into `record.text`, and any separator invented
 * here would make the timeline disagree with the reply. An adapter that emits
 * whole blocks rather than token deltas therefore has two adjacent blocks read
 * as one paragraph in the panel; an adapter that wants them visibly apart owns
 * that, by emitting the separation as part of its delta the way codex's
 * `agent_message` does.
 *
 * `at` stays that of the delta that opened the event, which is the honest answer
 * to "when did this text start".
 */
function mergeDelta(record: RunRecord, event: HarnessEvent): boolean {
  if (event.kind !== 'text' && event.kind !== 'reasoning') return false
  const tail = record.events[record.events.length - 1]
  if (tail === undefined || tail.seq <= record.deliveredSeq) return false
  if (tail.kind !== 'text' && tail.kind !== 'reasoning') return false
  if (tail.kind !== event.kind) return false
  tail.text += event.text
  return true
}

/** Copy defined usage fields onto the record; later reports overwrite earlier ones. */
function applyUsage(record: RunRecord, usage: {
  costUsd?: number
  turns?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  model?: string
}): void {
  if (usage.costUsd !== undefined) record.costUsd = usage.costUsd
  if (usage.turns !== undefined) record.turns = usage.turns
  if (usage.inputTokens !== undefined) record.inputTokens = usage.inputTokens
  if (usage.outputTokens !== undefined) record.outputTokens = usage.outputTokens
  if (usage.cachedTokens !== undefined) record.cachedTokens = usage.cachedTokens
  if (usage.reasoningTokens !== undefined) record.reasoningTokens = usage.reasoningTokens
  if (usage.model !== undefined) record.model = usage.model
}

/** Head of the prompt, marked when cut so a card never implies it showed all of it. */
function preview(prompt: string, max: number): string {
  return prompt.length > max ? `${prompt.slice(0, max)}…` : prompt
}
