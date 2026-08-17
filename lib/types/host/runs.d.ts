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
import type { HarnessEvent, RunDetail, RunSummary } from '../shared/events.ts';
import type { RunResult } from './adapter.ts';
/** Bounds that keep an unattended session from growing without limit. */
export interface RunStoreOptions {
    /** Events retained per run before the ring buffer starts evicting. */
    readonly maxEventsPerRun: number;
    /** Runs retained before the oldest finished one is discarded. */
    readonly maxRuns: number;
    /** Length of {@link RunSummary.promptPreview}. */
    readonly promptPreviewCharacters: number;
}
/** What identifies a run at the moment it is opened. */
export interface RunOpenSpec {
    readonly harness: string;
    readonly label: string;
    readonly mode: RunSummary['mode'];
    /** The requested session id, before the harness confirms one. */
    readonly sessionId: string;
    readonly cwd: string;
    /** The full prompt; the store keeps only a preview plus its length. */
    readonly prompt: string;
    /** The model tool call this run serves; see {@link RunSummary.callId}. */
    readonly callId?: string;
}
/**
 * Write surface for one open run, handed to the orchestrator so it never
 * re-looks-up a run id or has to handle a "run vanished" branch.
 */
export interface RunHandle {
    readonly runId: string;
    /** The child process is alive: `starting` → `running`. */
    markRunning(): void;
    /**
     * Record normalized events, assigning `seq` and `at`. Accepts a batch
     * because one native line can translate to several events and they must be
     * numbered together.
     */
    append(events: readonly HarnessEvent[]): void;
    /** Terminal transition: `running` → `done`, applying the adapter's verdict. */
    finish(result: RunResult): void;
}
export declare class RunStore {
    private readonly options;
    /**
     * Insertion-ordered, and insertion order IS `startedAt` order because ids are
     * handed out monotonically — so eviction can scan from the front for the
     * oldest finished run without sorting.
     */
    private readonly records;
    private runCounter;
    constructor(options: RunStoreOptions);
    /** Open a run and return its write surface. */
    open(spec: RunOpenSpec): RunHandle;
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
    list(): RunSummary[];
    /**
     * One run's summary plus its events after `sinceSeq`.
     * @returns `null` when the run id is unknown or has been evicted.
     */
    get(runId: string, sinceSeq: number): RunDetail | null;
    private appendTo;
    /**
     * Drop the oldest FINISHED runs until the roster fits. A live run is never a
     * candidate: it still has a handle writing into it, and evicting it would
     * make the browser's poll for a run that is visibly in progress return null.
     */
    private evict;
}
