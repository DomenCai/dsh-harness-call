/**
 * Everything the two surfaces read from the host.
 *
 * Three pieces, one theme — the browser owns no run state of its own, it only
 * mirrors the host store:
 *
 * - {@link createRunFeed}: ONE roster poller for the whole page. Every live
 *   card needs the same `list()` answer, so a timer per card would multiply the
 *   same request by the number of running calls. The feed starts its timer with
 *   the first subscriber and stops it with the last, which also means a page
 *   with no unsettled card polls nothing at all.
 * - {@link useRunDetail}: the focused run's incremental timeline. The client
 *   accumulates events itself and passes the store's `cursor` back as the next
 *   `sinceSeq`, so a poll that produced nothing new costs one empty array.
 * - the block readers: a tool-call block is the only thing a card is handed,
 *   and both payloads inside it are text — streaming JSON arguments and the
 *   JSON the host rendered its return value into. The block's own shape is
 *   typed, those two payloads are not, so everything pulled out of them is
 *   narrowed here rather than trusted.
 *
 * @module dsh-harness-call/client/runs
 */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client';
import type { RunDetail, RunSummary, StoredEvent } from '../shared/events.ts';
import type { HarnessCallRemoteClient } from '../shared/wire.ts';
/**
 * Whether the browser half can talk to the host store.
 *
 * Distinct from an empty roster: a live call with no matching run is still
 * "starting", but a channel that never mounted or whose `list()` keeps failing
 * must not hide behind that same copy.
 */
export interface ChannelStatus {
    /** The Remote namespace is mounted and at least one `list()` has succeeded. */
    ready: boolean;
    /** Last mount or poll failure; cleared on the next successful `list()`. */
    error: string | undefined;
}
/**
 * The page-wide run feed: a shared roster subscription plus the focused-run
 * fetch. Both faces are stable function identities, so they can ride
 * `useSyncExternalStore` and `useCallback` deps without re-subscribing.
 */
export interface RunFeed {
    /** Subscribe to roster changes; the first subscriber starts the poll timer. */
    subscribe: (listener: () => void) => () => void;
    /** Newest-first roster, as of the last SUCCESSFUL poll. */
    getSnapshot: () => readonly RunSummary[];
    /** Channel liveness as of the last poll or mount report. */
    getChannel: () => ChannelStatus;
    /**
     * Record a `$mount` failure so cards can show it before the first poll.
     * A successful mount clears the error and lets the next poll mark `ready`.
     */
    reportMount: (error: string | undefined) => void;
    /**
     * One incremental slice of a run's timeline. Three answers, because the
     * caller has to tell "nothing new yet" from "there will never be anything":
     *
     * - a {@link RunDetail}: the store answered.
     * - `'unknown'`: the store answered that it holds no such run. A definitive
     *   answer, not a failure — the host restarted (its store is in-memory) or
     *   the run was evicted by the retention cap.
     * - `undefined`: no answer at all — the Remote is not mounted yet, or the
     *   call failed. Callers keep whatever they last displayed and retry.
     */
    detail: (runId: string, sinceSeq: number) => Promise<RunDetail | 'unknown' | undefined>;
}
/**
 * Build the page's run feed over a live Remote namespace.
 *
 * @param resolve - reads the mounted namespace; it is `undefined` until the
 *   mount effect settles and again after unload, and the feed simply produces
 *   no updates in that window rather than holding a stale handle.
 * @returns the feed both the cards and the panel consume.
 */
export declare function createRunFeed(resolve: () => HarnessCallRemoteClient | undefined): RunFeed;
/**
 * Read the shared roster, polling only while `active`.
 *
 * @param feed - the page feed.
 * @param active - whether this surface still needs live data; an inactive
 *   reader holds no subscription, so the shared timer stops with the last one.
 * @returns the roster snapshot.
 */
export declare function useRoster(feed: RunFeed, active: boolean): readonly RunSummary[];
/**
 * Read the shared channel status, polling only while `active`.
 *
 * @param feed - the page feed.
 * @param active - whether this surface still needs live data.
 * @returns whether the Remote is up, and the last failure if any.
 */
export declare function useChannel(feed: RunFeed, active: boolean): ChannelStatus;
/**
 * Locate a still-running card's run in the roster.
 *
 * Two of the three levels live here. The first — the `runId` the settled tool
 * result carries — needs no search and is read straight off the block by
 * {@link readResult}.
 *
 * ONLY CALL THIS FOR AN UNSETTLED CALL. The host store is plugin-global, so the
 * roster carries every run of every session, and the harness fallback is a
 * guess by construction. Two rules keep the guess from landing on someone
 * else's run: a settled call never guesses (it either carries a `runId` or has
 * no timeline to show), and a finished run is never a candidate — it is over,
 * so it belongs to some earlier call, never to one still waiting for its first
 * roster answer.
 *
 * @param runs - the roster, newest `startedAt` first.
 * @param callId - the tool call this card was rendered for.
 * @param harness - the harness the call named, when the arguments parsed.
 * @returns the matching run, or `undefined` while the host has none.
 */
export declare function matchRun(runs: readonly RunSummary[], callId: string, harness: string | undefined): RunSummary | undefined;
/** One run as the panel sees it: the live summary plus the accumulated timeline. */
export interface RunView {
    summary: RunSummary;
    events: readonly StoredEvent[];
    text: string;
}
/**
 * Poll one run's timeline incrementally until nothing more can arrive.
 *
 * @param feed - the page feed.
 * @param runId - the focused run; `undefined` while it is still unresolved.
 * @param settled - whether the tool call itself has already produced a result.
 *   It is what makes an `'unknown'` answer terminal: for a call still in flight
 *   the host may simply not have opened the record yet, but for a settled one
 *   the run existed and the store has since forgotten it, so asking again is
 *   asking forever.
 * @returns the accumulated view, or `undefined` before the first answer.
 */
export declare function useRunDetail(feed: RunFeed, runId: string | undefined, settled: boolean): RunView | undefined;
/** The tool arguments a card renders from. */
export interface CallArgs {
    harness: string | undefined;
    prompt: string | undefined;
}
/**
 * Read the tool arguments off either block shape.
 *
 * `'kind' in block` is the discriminant the slot catalog prescribes: only the
 * settled {@link ToolResultNode} half of the union carries a `kind`, the running
 * call has none, so there is no field to compare.
 *
 * @param block - the block this card was rendered for.
 * @returns the two arguments the UI shows; both absent when the call head fell
 *   outside the conversation window.
 */
export declare function readArgs(block: ToolCallBlock): CallArgs;
/** The fields this half reads out of the tool's own return value. */
export interface HarnessResult {
    ok: boolean;
    /** The handle to the host's structured timeline; absent on early-exit results. */
    runId: string | undefined;
    label: string | undefined;
    mode: string | undefined;
    sessionId: string | undefined;
    cwd: string | undefined;
    elapsedMs: number | undefined;
    /** How many events the run produced, as counted by the host. */
    steps: number | undefined;
    /** Reported cost in USD, when the harness accounted for it. */
    costUsd: number | undefined;
    /**
     * Reported assistant turns. The host names this `numTurns` on the wire; the
     * run summary calls it `turns`, and the panel reads both, so the name is
     * translated here rather than at every display site.
     */
    turns: number | undefined;
    errors: readonly string[];
    text: string;
}
/**
 * Read the settled tool result.
 *
 * The host renders its JSON value into a single text content block, so the
 * result is recovered by parsing the first text block. Every field is narrowed
 * because the early-exit shapes in host/tool.ts carry only a subset.
 *
 * @param block - the block this card was rendered for.
 * @returns the result, or `undefined` while the call has not settled.
 */
export declare function readResult(block: ToolCallBlock): HarnessResult | undefined;
/** Whole seconds, the unit both surfaces show durations in. */
export declare function seconds(ms: number): number;
/** Flatten any value onto one line, capped — the previews' only lossy step. */
export declare function brief(value: unknown, max: number): string;
