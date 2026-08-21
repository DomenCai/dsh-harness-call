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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SessionId, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { RunDetail, RunSummary, StoredEvent } from '../shared/events.js'
import { projectActivities, type ActivityProjection } from './activities.js'
import type { HarnessCallRemoteClient } from '../shared/wire.js'

/**
 * Poll cadence of both the roster and the focused run. The host store is
 * in-memory and the payloads are small; the cost that matters is the number of
 * concurrent timers, which the shared feed already collapses to one.
 */
const POLL_MS = 2000

/** Stable empty roster, so a never-polled feed keeps one snapshot identity. */
const NO_RUNS: readonly RunSummary[] = []

/**
 * Whether the browser half can talk to the host store.
 *
 * Distinct from an empty roster: a live call with no matching run is still
 * "starting", but a channel that never mounted or whose `list()` keeps failing
 * must not hide behind that same copy.
 */
export interface ChannelStatus {
  /** The Remote namespace is mounted and at least one `list()` has succeeded. */
  ready: boolean
  /** Last mount or poll failure; cleared on the next successful `list()`. */
  error: string | undefined
}

/** Stable empty channel, so a never-polled feed keeps one snapshot identity. */
const NO_CHANNEL: ChannelStatus = { ready: false, error: undefined }

/**
 * The page-wide run feed: a shared roster subscription plus the focused-run
 * fetch. Both faces are stable function identities, so they can ride
 * `useSyncExternalStore` and `useCallback` deps without re-subscribing.
 */
export interface RunFeed {
  /** Subscribe to roster changes; the first subscriber starts the poll timer. */
  subscribe: (listener: () => void) => () => void
  /** Newest-first roster, as of the last SUCCESSFUL poll. */
  getSnapshot: () => readonly RunSummary[]
  /** Channel liveness as of the last poll or mount report. */
  getChannel: () => ChannelStatus
  /**
   * Record a `$mount` failure so cards can show it before the first poll.
   * A successful mount clears the error and lets the next poll mark `ready`.
   */
  reportMount: (error: string | undefined) => void
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
  detail: (runId: string, sinceSeq: number) => Promise<RunDetail | 'unknown' | undefined>
}

/**
 * Build the page's run feed over a live Remote namespace.
 *
 * @param resolve - reads the mounted namespace; it is `undefined` until the
 *   mount effect settles and again after unload, and the feed simply produces
 *   no updates in that window rather than holding a stale handle.
 * @returns the feed both the cards and the panel consume.
 */
export function createRunFeed(resolve: () => HarnessCallRemoteClient | undefined): RunFeed {
  const listeners = new Set<() => void>()
  let snapshot: readonly RunSummary[] = NO_RUNS
  let channel: ChannelStatus = NO_CHANNEL
  let timer: number | undefined
  let inFlight = false

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const setChannel = (next: ChannelStatus): void => {
    if (channel.ready === next.ready && channel.error === next.error) return
    channel = next
    notify()
  }

  const poll = async (): Promise<void> => {
    const api = resolve()
    // `list` carries no abort signal, so an overrunning poll cannot be
    // cancelled — it is skipped instead, which keeps a slow host from queueing
    // one request per tick.
    if (api === undefined || inFlight) return
    inFlight = true
    try {
      const outcome = await api.list()
      // A failed poll keeps the last good roster on screen; blanking it would
      // reset every live card to "starting" on one dropped request. The error
      // is published so a card that has never seen a run can say why.
      if (!outcome.ok) {
        setChannel({ ready: channel.ready, error: outcome.error.message })
        return
      }
      snapshot = outcome.value
      channel = { ready: true, error: undefined }
      notify()
    } catch (error) {
      // A REJECTION is the same event as `ok: false`, and it is not exotic: the
      // outcome envelope only folds in call-level failures, while an arity or
      // mount mismatch throws, and the api gateway throws outright once the
      // websocket is gone. Restarting the host with a live card on screen would
      // otherwise raise one unhandled rejection every poll until it reconnects.
      setChannel({
        ready: channel.ready,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      inFlight = false
    }
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      if (timer === undefined) {
        void poll()
        timer = window.setInterval(() => { void poll() }, POLL_MS)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      }
    },
    getSnapshot: () => snapshot,
    getChannel: () => channel,
    reportMount: (error) => {
      setChannel({ ready: false, error })
    },
    detail: async (runId, sinceSeq) => {
      const api = resolve()
      if (api === undefined) return undefined
      try {
        const outcome = await api.get(runId, sinceSeq)
        if (!outcome.ok) return undefined
        return outcome.value ?? 'unknown'
      } catch {
        // Same reasoning as the roster poll: a throw is a failed call, not an
        // answer, so the caller keeps its last snapshot and tries again.
        return undefined
      }
    },
  }
}

/**
 * Read the shared roster, polling only while `active`.
 *
 * @param feed - the page feed.
 * @param active - whether this surface still needs live data; an inactive
 *   reader holds no subscription, so the shared timer stops with the last one.
 * @returns the roster snapshot.
 */
export function useRoster(feed: RunFeed, active: boolean): readonly RunSummary[] {
  const subscribe = useCallback(
    (listener: () => void) => (active ? feed.subscribe(listener) : () => {}),
    [feed, active],
  )
  return useSyncExternalStore(subscribe, feed.getSnapshot)
}

/**
 * Read the shared channel status, polling only while `active`.
 *
 * @param feed - the page feed.
 * @param active - whether this surface still needs live data.
 * @returns whether the Remote is up, and the last failure if any.
 */
export function useChannel(feed: RunFeed, active: boolean): ChannelStatus {
  const subscribe = useCallback(
    (listener: () => void) => (active ? feed.subscribe(listener) : () => {}),
    [feed, active],
  )
  return useSyncExternalStore(subscribe, feed.getChannel)
}

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
 * @param startedBefore - upper bound on the GUESS only, for callers that are
 *   reading a snapshot older than the roster: a run that began after their
 *   snapshot cannot be theirs. Exact `callId` matches ignore it — they are
 *   identity, not inference, and no clock can make them wrong.
 * @returns the matching run, or `undefined` while the host has none.
 */
export function matchRun(
  runs: readonly RunSummary[],
  callId: string,
  harness: string | undefined,
  startedBefore = Infinity,
): RunSummary | undefined {
  const exact = runs.find(run => run.callId === callId)
  if (exact !== undefined) return exact
  // The newest UNFINISHED run of the same harness: the granularity this plugin
  // had before runs were keyed, minus the finished runs that made a one-second-
  // old call report the elapsed time and session of its predecessor.
  return runs.find(run => {
    return run.harness === harness && run.phase !== 'done' && run.startedAt <= startedBefore
  })
}

/**
 * How an unsettled tool card should present a roster hit.
 *
 * DSH may delay writing the tool-result block so parallel calls stay in
 * model order. The host store is already `done` then; only an *exact*
 * `callId` match in that phase is treated as host-complete. A guessed hit
 * stays live, and elapsed for host-complete is frozen: `elapsedMs`, or
 * `finishedAt - startedAt` when that is all the roster has — never `now`.
 */
export type UnsettledCardState =
  | { kind: 'starting' }
  | { kind: 'running'; elapsedMs: number; eventCount: number }
  | {
      kind: 'hostDone'
      ok: boolean
      elapsedMs: number | undefined
      eventCount: number
      sessionId: string | null
      errors: readonly string[]
    }

/**
 * @param summary - roster row {@link matchRun} returned, if any.
 * @param callId - the tool call this card was rendered for.
 * @param now - wall clock used only while the host run is still live.
 */
export function unsettledCardState(
  summary: RunSummary | undefined,
  callId: string,
  now: number,
): UnsettledCardState {
  if (summary !== undefined && summary.callId === callId && summary.phase === 'done') {
    return {
      kind: 'hostDone',
      ok: summary.ok === true,
      elapsedMs: frozenElapsedMs(summary),
      eventCount: summary.eventCount,
      sessionId: summary.sessionId,
      errors: summary.errors,
    }
  }
  if (summary === undefined || summary.phase === 'starting') {
    return { kind: 'starting' }
  }
  return {
    kind: 'running',
    elapsedMs: now - summary.startedAt,
    eventCount: summary.eventCount,
  }
}

/** Finished duration from the roster itself, never wall-clock `now`. */
function frozenElapsedMs(summary: RunSummary): number | undefined {
  if (summary.elapsedMs !== undefined) return summary.elapsedMs
  if (summary.finishedAt !== undefined) return Math.max(0, summary.finishedAt - summary.startedAt)
  return undefined
}

/** One run as the panel sees it: the live summary plus the accumulated timeline. */
export interface RunView {
  summary: RunSummary
  events: readonly StoredEvent[]
  /** Start/finish projection of `events`; rebuilt whenever the timeline grows. */
  activities: ActivityProjection
  text: string
}

/**
 * Poll one run's timeline incrementally until nothing more can arrive.
 *
 * @param feed - the page feed.
 * @param runId - the focused run; `undefined` while it is still unresolved.
 * @param authoritative - whether `runId` came from a source that KNOWS it (the
 *   tool result, or a persisted target), as opposed to a roster guess. It is
 *   what makes an `'unknown'` answer terminal: a guessed id may simply not be
 *   in the store yet, but a known one names a run the store has forgotten, so
 *   asking again is asking forever.
 * @returns the accumulated view (or `undefined` before the first answer) and
 *   whether a known run was confirmed missing from the in-memory store.
 */
export function useRunDetail(
  feed: RunFeed,
  runId: string | undefined,
  authoritative: boolean,
  active = true,
): { view: RunView | undefined, missing: boolean } {
  const [view, setView] = useState<RunView | undefined>(undefined)
  const [missing, setMissing] = useState(false)
  /**
   * Nothing more will ever arrive for this run, so the timer stops. Derived
   * from the ANSWERS, not from the caller's snapshot of the click: a card that
   * was running when it was clicked keeps that shape forever, so anything read
   * off it would leave the poll running for as long as the panel is open.
   */
  const [terminal, setTerminal] = useState(false)
  const cursor = useRef(0)
  const events = useRef<readonly StoredEvent[]>([])
  /**
   * Stands in for the AbortController a signal-less Remote cannot take: every
   * reset and every unmount bumps it, and a response from an older generation
   * is dropped instead of appended to the wrong run.
   */
  const generation = useRef(0)
  const inFlight = useRef(false)

  // Declared before the poll effect so a run change resets the accumulation
  // before the new run's first request can land.
  useEffect(() => {
    cursor.current = 0
    events.current = []
    generation.current += 1
    inFlight.current = false
    setView(undefined)
    setTerminal(false)
    setMissing(false)
  }, [runId])

  const load = useCallback(async (): Promise<void> => {
    if (runId === undefined || inFlight.current) return
    const issued = generation.current
    inFlight.current = true
    try {
      const detail = await feed.detail(runId, cursor.current)
      if (issued !== generation.current || detail === undefined) return
      if (detail === 'unknown') {
        if (authoritative) {
          setTerminal(true)
          setMissing(true)
        }
        return
      }
      cursor.current = detail.cursor
      if (detail.events.length > 0) events.current = [...events.current, ...detail.events]
      if (detail.summary.phase === 'done') setTerminal(true)
      setView({
        summary: detail.summary,
        events: events.current,
        activities: projectActivities(events.current),
        text: detail.text,
      })
    } finally {
      if (issued === generation.current) inFlight.current = false
    }
  }, [feed, runId, authoritative])

  useEffect(() => {
    if (!active || runId === undefined || terminal) return
    void load()
    const timer = window.setInterval(() => { void load() }, POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [load, runId, terminal, active])

  useEffect(() => () => { generation.current += 1 }, [])

  return { view, missing }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asTexts(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  const texts: string[] = []
  for (const item of value as readonly unknown[]) {
    if (typeof item === 'string' && item.length > 0) texts.push(item)
  }
  return texts
}

/** The tool arguments a card renders from. */
export interface CallArgs {
  harness: string | undefined
  prompt: string | undefined
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
export function readArgs(block: ToolCallBlock): CallArgs {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (raw === undefined || raw.length === 0) return { harness: undefined, prompt: undefined }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Arguments stream in token by token: a card can render mid-call, while
    // `argsRaw` is still a partial JSON prefix. That is expected, not an error.
    return { harness: undefined, prompt: undefined }
  }
  const args = asRecord(parsed)
  return { harness: asText(args?.harness), prompt: asText(args?.prompt) }
}

/**
 * What a card hands a run surface when it is clicked. A snapshot of that
 * moment, never refreshed: nothing here may be used as a liveness signal.
 *
 * A SIDEBAR TAB PERSISTS THIS. The host store does not survive a restart, so
 * every field has to stay meaningful when it is read back against an empty
 * store — which is what {@link PanelTarget.openedAt} is for.
 */
export interface PanelTarget {
  /** The tool call the card was rendered for; the correlation key. */
  callId: string
  /**
   * The conversation session the card lives in. Overlay and sidebar both
   * need it: overlay is root-scoped, sidebar openTab is session-scoped.
   */
  sessionId: SessionId
  harness: string | undefined
  label: string
  /** The prompt the model composed. */
  prompt: string | undefined
  /**
   * The host's run handle, when the card already had one: `result.runId` on a
   * settled call, the matched roster summary's on a running one. Its presence
   * is what makes an `'unknown'` detail answer terminal rather than "not yet".
   */
  runId: string | undefined
  /**
   * Wall clock at the click. Two jobs, both about a restarted host:
   * a run started AFTER this instant cannot be the one this target names, and
   * a search that has outlived its grace period is looking for a run that no
   * longer exists.
   */
  openedAt: number
  /** The settled tool result, when there is one. */
  result: HarnessResult | undefined
}

/** The fields this half reads out of the tool's own return value. */
export interface HarnessResult {
  ok: boolean
  /** The handle to the host's structured timeline; absent on early-exit results. */
  runId: string | undefined
  mode: string | undefined
  sessionId: string | undefined
  elapsedMs: number | undefined
  /** How many events the run produced, as counted by the host. */
  steps: number | undefined
  /** Reported cost in USD, when the harness accounted for it. */
  costUsd: number | undefined
  /**
   * Reported assistant turns. The host names this `numTurns` on the wire; the
   * run summary calls it `turns`, and the panel reads both, so the name is
   * translated here rather than at every display site.
   */
  turns: number | undefined
  errors: readonly string[]
  /** Trailing stderr lines the host surfaces on a failed run. */
  stderrTail: readonly string[]
  text: string
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
export function readResult(block: ToolCallBlock): HarnessResult | undefined {
  if (!('kind' in block)) return undefined
  let parsed: unknown
  // Treat `content` as opaque and narrow every step: the elements are wire
  // content blocks, and the array itself is only as trustworthy as the frame it
  // was assembled from.
  const content: readonly unknown[] = Array.isArray(block.content) ? block.content : []
  for (const item of content) {
    const entry = asRecord(item)
    if (entry?.type !== 'text' || typeof entry.text !== 'string') continue
    try {
      parsed = JSON.parse(entry.text)
    } catch {
      return undefined
    }
    break
  }
  const value = asRecord(parsed)
  if (value === undefined) return undefined
  return {
    ok: value.ok === true,
    runId: asText(value.runId),
    mode: asText(value.mode),
    sessionId: asText(value.sessionId),
    elapsedMs: asNumber(value.elapsedMs),
    steps: asNumber(value.steps),
    costUsd: asNumber(value.costUsd),
    turns: asNumber(value.numTurns),
    errors: asTexts(value.errors),
    stderrTail: asTexts(value.stderrTail),
    text: asText(value.text) ?? '',
  }
}

/** Whole seconds, the unit both surfaces show durations in. */
export function seconds(ms: number): number {
  return Math.round(ms / 1000)
}

/** Flatten any value onto one line, capped — the previews' only lossy step. */
export function brief(value: unknown, max: number): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  const text = raw.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
