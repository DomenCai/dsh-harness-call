import { describe, expect, it } from 'vitest'
import type { RunSummary, StoredEvent } from '../src/shared/events.js'
import { truncateHeadTail, utf8ByteLength } from '../src/host/truncate.js'
import { projectActivities } from '../src/client/activities.js'
import { defaultHarnessCallSettings, normalizeHarnessCallSettings, resolveRunPolicy } from '../src/shared/policy.js'
import { matchRun, unsettledCardState } from '../src/client/runs.js'

describe('truncateHeadTail', () => {
  it('keeps exact-budget strings and preserves multibyte boundaries', () => {
    expect(truncateHeadTail('abcd', 4)).toEqual({ text: 'abcd', truncated: false, originalBytes: 4 })
    const result = truncateHeadTail('甲乙丙丁戊', 8)
    expect(result.truncated).toBe(true)
    expect(result.text).not.toContain('�')
    expect(result.originalBytes).toBe(15)
  })

  it('handles a budget smaller than one character', () => {
    const result = truncateHeadTail('😀x', 1)
    expect(result.text).toBe('\n…\nx')
    expect(utf8ByteLength(result.text)).toBeGreaterThan(1)
  })
})

describe('projectActivities', () => {
  it('handles failed finishes, orphan finishes, duplicate starts, and out-of-order completion', () => {
    const events: StoredEvent[] = [
      { kind: 'tool_finish', callId: 'orphan', name: 'Bash', failed: true, seq: 1, at: 1 },
      { kind: 'tool_start', callId: 'a', name: 'Read', seq: 2, at: 2 },
      { kind: 'tool_start', callId: 'a', name: 'Read', input: { path: 'a' }, seq: 3, at: 3 },
      { kind: 'tool_start', callId: 'b', name: 'Bash', seq: 4, at: 4 },
      { kind: 'tool_finish', callId: 'b', name: 'Bash', exitCode: 7, failed: true, seq: 5, at: 5 },
      { kind: 'tool_finish', callId: 'a', name: 'Read', seq: 6, at: 6 },
    ]
    const projection = projectActivities(events)
    expect(projection.orphans[0]).toMatchObject({ callId: 'orphan', status: 'failed', finishSeq: 1 })
    expect(projection.tools).toHaveLength(2)
    expect(projection.tools[0]).toMatchObject({ callId: 'a', input: { path: 'a' }, status: 'done', finishSeq: 6 })
    expect(projection.tools[1]).toMatchObject({ callId: 'b', status: 'failed', exitCode: 7, finishSeq: 5 })
  })
})

describe('settings policy', () => {
  it('normalizes partial settings and keeps Codex read-only fallback', () => {
    const settings = normalizeHarnessCallSettings({ codex: { effort: 'high' }, logs: { enabled: true } })
    expect(settings.logs.enabled).toBe(true)
    expect(settings.logs.directory).toBe(defaultHarnessCallSettings().logs.directory)
    expect(settings.codex.effort).toBe('high')
    expect(resolveRunPolicy(settings, 'codex', {})).toEqual({ access: 'read-only', effort: 'high' })
  })

  it('lets concrete settings override model arguments', () => {
    const settings = normalizeHarnessCallSettings({
      grok: { access: 'workspace-write', effort: 'low' },
    })
    expect(resolveRunPolicy(settings, 'grok', { access: 'full-access', effort: 'xhigh' }))
      .toEqual({ access: 'workspace-write', effort: 'low' })
  })
})

function summary(partial: Partial<RunSummary>): RunSummary {
  return {
    runId: 'r', harness: 'grok', label: 'Grok', phase: 'running', mode: 'new', sessionId: null,
    cwd: '/tmp', promptPreview: '', promptCharacters: 0, startedAt: 1, errors: [], eventCount: 0,
    droppedEvents: 0, ...partial,
  }
}

describe('matchRun', () => {
  it('prefers exact call identity even outside the guess time bound', () => {
    const exact = summary({ runId: 'exact', callId: 'c', startedAt: 100 })
    expect(matchRun([exact], 'c', 'grok', 10)?.runId).toBe('exact')
  })

  it('guesses only the newest unfinished matching harness before the bound', () => {
    const runs = [
      summary({ runId: 'done', phase: 'done', startedAt: 3 }),
      summary({ runId: 'late', startedAt: 30 }),
      summary({ runId: 'match', startedAt: 20 }),
    ]
    expect(matchRun(runs, 'missing', 'grok', 25)?.runId).toBe('match')
  })
})

describe('unsettledCardState', () => {
  it('keeps a live exact match running with wall-clock elapsed', () => {
    const live = summary({ callId: 'c', phase: 'running', startedAt: 1_000, eventCount: 4 })
    expect(unsettledCardState(live, 'c', 5_000)).toEqual({
      kind: 'running', elapsedMs: 4_000, eventCount: 4,
    })
  })

  it('freezes exact done matches with success or failure, never ticking elapsed', () => {
    const now = 999_000
    const ok = summary({
      callId: 'c', phase: 'done', ok: true, elapsedMs: 1_200, startedAt: 1,
      eventCount: 8, sessionId: 's', errors: [],
    })
    expect(unsettledCardState(ok, 'c', now)).toEqual({
      kind: 'hostDone', ok: true, elapsedMs: 1_200, eventCount: 8, sessionId: 's', errors: [],
    })
    const failed = summary({
      callId: 'c', phase: 'done', ok: false, elapsedMs: 800, startedAt: 1,
      eventCount: 2, sessionId: null, errors: ['boom'],
    })
    expect(unsettledCardState(failed, 'c', now)).toEqual({
      kind: 'hostDone', ok: false, elapsedMs: 800, eventCount: 2, sessionId: null, errors: ['boom'],
    })
  })

  it('falls back to finishedAt - startedAt and keeps a zero event count', () => {
    const now = 999_000
    const done = summary({
      callId: 'c', phase: 'done', ok: true, startedAt: 1_000, finishedAt: 2_500,
      eventCount: 0, sessionId: 's', errors: [],
    })
    expect(unsettledCardState(done, 'c', now)).toEqual({
      kind: 'hostDone', ok: true, elapsedMs: 1_500, eventCount: 0, sessionId: 's', errors: [],
    })
  })

  it('ignores a done roster row that is not an exact callId match', () => {
    const other = summary({
      callId: 'other', phase: 'done', ok: true, elapsedMs: 10, startedAt: 1, eventCount: 1,
    })
    expect(unsettledCardState(other, 'c', 50_000).kind).toBe('running')
    expect(matchRun([other], 'c', 'grok')?.runId).toBeUndefined()
  })
})
