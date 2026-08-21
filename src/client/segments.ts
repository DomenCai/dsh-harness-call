/** Chronological transcript segmentation, kept pure for replay tests. */

import type { StoredEvent } from '../shared/events.js'
import type { ToolActivity } from './activities.js'

export type TranscriptEvent = Exclude<StoredEvent,
  | { kind: 'text' }
  | { kind: 'tool_start' }
  | { kind: 'tool_finish' }
  | { kind: 'usage' }
>

export type ProcessRow =
  | { kind: 'tool', seq: number, at: number, activity: ToolActivity }
  | { kind: 'event', seq: number, at: number, event: TranscriptEvent }

export type TranscriptSegment =
  | { kind: 'text', seq: number, text: string, last: boolean, afterProcess: boolean }
  | { kind: 'process', seq: number, rows: ProcessRow[] }

/**
 * Split retained events at text boundaries. Adjacent text events are exact
 * deltas and merge byte-for-byte; only a non-text event starts a new segment.
 */
export function buildSegments(
  events: readonly StoredEvent[],
  tools: readonly ToolActivity[],
  orphans: readonly ToolActivity[],
): TranscriptSegment[] {
  const byStart = new Map(tools.map(tool => [tool.startSeq, tool]))
  const byFinish = new Map(orphans.map(orphan => [orphan.finishSeq, orphan]))
  const segments: TranscriptSegment[] = []

  const addProcessRow = (row: ProcessRow): void => {
    const tail = segments[segments.length - 1]
    if (tail?.kind === 'process') {
      tail.rows.push(row)
      return
    }
    segments.push({ kind: 'process', seq: row.seq, rows: [row] })
  }

  for (const event of events) {
    if (event.kind === 'text') {
      const tail = segments[segments.length - 1]
      if (tail?.kind === 'text') tail.text += event.text
      else segments.push({
        kind: 'text',
        seq: event.seq,
        text: event.text,
        last: false,
        afterProcess: tail?.kind === 'process',
      })
      continue
    }
    if (event.kind === 'usage') continue
    if (event.kind === 'tool_start') {
      const activity = byStart.get(event.seq)
      if (activity !== undefined) addProcessRow({ kind: 'tool', seq: event.seq, at: event.at, activity })
      continue
    }
    if (event.kind === 'tool_finish') {
      const activity = byFinish.get(event.seq)
      if (activity !== undefined) addProcessRow({ kind: 'tool', seq: event.seq, at: event.at, activity })
      continue
    }
    addProcessRow({ kind: 'event', seq: event.seq, at: event.at, event })
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment?.kind === 'text') {
      segment.last = true
      break
    }
  }
  return segments
}

/** Whether the current tail is eligible for automatic disclosure. */
export function shouldAutoOpenTail(
  done: boolean,
  sawLive: boolean,
  lastKind: TranscriptSegment['kind'] | undefined,
): boolean {
  return lastKind === 'process' && (!done || sawLive)
}

/** Remove exactly one adapter-owned block separator at a process→text edge. */
export function displaySegmentText(segment: Extract<TranscriptSegment, { kind: 'text' }>): string {
  return segment.afterProcess && segment.text.startsWith('\n\n') ? segment.text.slice(2) : segment.text
}
