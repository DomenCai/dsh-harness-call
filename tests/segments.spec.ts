import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HarnessEvent, StoredEvent } from '../src/shared/events.js'
import { projectActivities } from '../src/client/activities.js'
import { buildSegments, displaySegmentText, shouldAutoOpenTail } from '../src/client/segments.js'

function stored(events: readonly HarnessEvent[]): StoredEvent[] {
  return events.map((event, index) => ({ ...event, seq: index + 1, at: index * 10 }))
}

describe('automatic process disclosure', () => {
  it('keeps a live terminal process open on completion but closes historical completed runs', () => {
    expect(shouldAutoOpenTail(false, false, 'process')).toBe(true)
    expect(shouldAutoOpenTail(true, true, 'process')).toBe(true)
    expect(shouldAutoOpenTail(true, false, 'process')).toBe(false)
    expect(shouldAutoOpenTail(false, true, 'text')).toBe(false)
  })
})

describe('buildSegments', () => {
  it('merges polling text boundaries exactly and splits only on non-text events', () => {
    const events = stored([
      { kind: 'text', text: '# Title\n' },
      { kind: 'text', text: '  indented' },
      { kind: 'tool_start', callId: 'c1', name: 'Read', input: { path: 'a.md' } },
      { kind: 'tool_finish', callId: 'c1', name: 'Read', output: 'ok' },
      { kind: 'text', text: '\n\nfinal' },
      { kind: 'usage', inputTokens: 1 },
      { kind: 'reasoning', text: 'checking' },
      { kind: 'text', text: ' tail' },
    ])
    const activities = projectActivities(events)
    const segments = buildSegments(events, activities.tools, activities.orphans)
    expect(segments.map(segment => segment.kind)).toEqual(['text', 'process', 'text', 'process', 'text'])
    expect(segments[0]).toMatchObject({ seq: 1, text: '# Title\n  indented', last: false })
    expect(segments[1]).toMatchObject({ seq: 3, rows: [{ kind: 'tool', seq: 3 }] })
    expect(segments[2]).toMatchObject({ seq: 5, text: '\n\nfinal', last: false, afterProcess: true })
    expect(segments[3]).toMatchObject({ seq: 7, rows: [{ kind: 'event', seq: 7 }] })
    expect(segments[4]).toMatchObject({ seq: 8, text: ' tail', last: true, afterProcess: true })
    const final = segments[4]
    expect(final?.kind === 'text' ? displaySegmentText(final) : '').toBe(' tail')
  })

  it('renders orphan finishes at their own sequence and emits no empty process segment', () => {
    const events = stored([
      { kind: 'tool_finish', callId: 'orphan', name: 'Bash', failed: true },
      { kind: 'usage', outputTokens: 2 },
      { kind: 'text', text: 'answer' },
    ])
    const activities = projectActivities(events)
    const segments = buildSegments(events, activities.tools, activities.orphans)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ kind: 'process', seq: 1, rows: [{ kind: 'tool', seq: 1 }] })
    expect(segments[1]).toMatchObject({ kind: 'text', seq: 3, text: 'answer', last: true })
  })

  it('keeps every replay corpus text byte in chronological segments', async () => {
    const stems = ['claude-minimal', 'codex-minimal', 'grok-minimal', 'kimi-minimal']
    for (const stem of stems) {
      const expected = JSON.parse(await readFile(join(process.cwd(), 'tests/fixtures', stem + '.expected.json'), 'utf8')) as { events: HarnessEvent[] }
      const events = stored(expected.events)
      const activities = projectActivities(events)
      const segments = buildSegments(events, activities.tools, activities.orphans)
      const sourceText = expected.events.filter((event): event is Extract<HarnessEvent, { kind: 'text' }> => event.kind === 'text').map(event => event.text).join('')
      const segmentedText = segments.filter(segment => segment.kind === 'text').map(segment => segment.text).join('')
      expect(segmentedText, stem).toBe(sourceText)
      expect(segments.some((segment, index) => segment.kind === 'process' && segments[index + 1]?.kind === 'process'), stem).toBe(false)
    }
  })
})
