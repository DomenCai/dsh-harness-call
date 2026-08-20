/**
 * Client-side projection of the append-only event stream into tool cards.
 *
 * The store never groups start/finish: it only sequences. Cards are a view
 * concern — callId is the join key, startSeq is the sort key, and a finish
 * never moves a card that already appeared. An orphan finish (its start
 * evicted from the ring buffer) is collected separately so the UI can say
 * so instead of inventing a duration it cannot know.
 *
 * @module dsh-harness-call/client/activities
 */

import type { StoredEvent } from '../shared/events.js'

/** Lifecycle of one projected tool card. */
export type ToolActivityStatus = 'running' | 'done' | 'failed'

/**
 * One tool invocation as the panel renders it. Duration is derived
 * (finishAt - startAt) rather than stored, so a live card has none.
 *
 * The start pair is optional for one reason only: an orphan finish never had
 * its start retained, so there is no beginning to report. Timing it from the
 * finish would print `0.0s` — a claim the run never made.
 */
export interface ToolActivity {
  callId: string
  name: string
  startSeq?: number
  startAt?: number
  finishSeq?: number
  finishAt?: number
  input?: unknown
  output?: string
  outputTruncated?: boolean
  outputOriginalBytes?: number
  exitCode?: number
  status: ToolActivityStatus
}

/** Start-ordered cards plus finishes whose start has been evicted. */
export interface ActivityProjection {
  tools: ToolActivity[]
  orphans: ToolActivity[]
}

function failedExit(exitCode: number | undefined): boolean {
  return exitCode !== undefined && exitCode !== 0
}

function finishFields(event: StoredEvent & { kind: 'tool_finish' }): Partial<ToolActivity> & Pick<ToolActivity, 'status'> {
  return {
    finishSeq: event.seq,
    finishAt: event.at,
    status: failedExit(event.exitCode) ? 'failed' : 'done',
    ...(event.output !== undefined ? { output: event.output } : {}),
    ...(event.outputTruncated === true ? { outputTruncated: true } : {}),
    ...(event.outputOriginalBytes !== undefined ? { outputOriginalBytes: event.outputOriginalBytes } : {}),
    ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
  }
}

/**
 * Project retained events into tool cards.
 *
 * Walking in seq order means a finish that lands before its start in the
 * buffer still becomes an orphan rather than a card that later jumps.
 * Duplicate starts keep the first; a later start may only fill in a missing input.
 */
export function projectActivities(events: readonly StoredEvent[]): ActivityProjection {
  const byId = new Map<string, ToolActivity>()
  const order: string[] = []
  const orphans: ToolActivity[] = []

  for (const event of events) {
    if (event.kind === 'tool_start') {
      const existing = byId.get(event.callId)
      if (existing === undefined) {
        byId.set(event.callId, {
          callId: event.callId,
          name: event.name,
          startSeq: event.seq,
          startAt: event.at,
          status: 'running',
          ...(event.input !== undefined ? { input: event.input } : {}),
        })
        order.push(event.callId)
      } else if (existing.input === undefined && event.input !== undefined) {
        existing.input = event.input
      }
      continue
    }
    if (event.kind !== 'tool_finish') continue
    const existing = byId.get(event.callId)
    if (existing === undefined) {
      orphans.push({
        callId: event.callId,
        name: event.name,
        ...finishFields(event),
      })
      continue
    }
    Object.assign(existing, finishFields(event))
    if (existing.name === 'tool') existing.name = event.name
  }

  const tools: ToolActivity[] = []
  for (const id of order) {
    const activity = byId.get(id)
    if (activity !== undefined) tools.push(activity)
  }
  return { tools, orphans }
}

/** Compact byte count for truncation labels (16 KB, 1.2 MB). Uses 1024-based units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) {
    const n = bytes / 1024
    return (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + ' KB'
  }
  const n = bytes / (1024 * 1024)
  return (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + ' MB'
}

/** Duration label: tenths below 10s so a 300ms Read does not round to 0s. */
export function formatDuration(ms: number): string {
  if (ms < 10000) return (ms / 1000).toFixed(1) + 's'
  return Math.round(ms / 1000) + 's'
}

/** Command string a TerminalBlock can render, when the input is one. */
export function commandLine(input: unknown): string | undefined {
  if (typeof input === 'string' && input.length > 0) return input
  if (typeof input === 'object' && input !== null && 'command' in input) {
    const command = (input as { command?: unknown }).command
    if (typeof command === 'string' && command.length > 0) return command
  }
  return undefined
}

/** Tools whose input is a shell command, rendered with TerminalBlock. */
export function isCommandTool(name: string): boolean {
  return name === 'command_execution' || name === 'Bash' || name === 'bash' || name === 'Shell'
}

/**
 * A legacy one-shot tool event as a settled card, so pre-protocol runs still
 * render. The callId is only a React key — it is never sent back.
 */
export function legacyToolActivity(event: StoredEvent & { kind: 'tool' }): ToolActivity {
  const failed = failedExit(event.exitCode)
  return {
    callId: 'legacy:' + event.seq,
    name: event.name,
    startSeq: event.seq,
    startAt: event.at,
    finishSeq: event.seq,
    finishAt: event.at,
    status: event.exitCode === undefined ? 'running' : failed ? 'failed' : 'done',
    ...(event.input !== undefined ? { input: event.input } : {}),
    ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
  }
}
