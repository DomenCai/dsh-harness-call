import { describe, expect, it } from 'vitest'
import type { StoredEvent } from '../src/shared/events.js'
import { buildModelResult } from '../src/host/tool.js'

function base(overrides: Partial<Parameters<typeof buildModelResult>[0]> = {}): Parameters<typeof buildModelResult>[0] {
  return {
    ok: true,
    runId: 'r1',
    mode: 'new',
    sessionId: 's1',
    elapsedMs: 10,
    steps: 3,
    text: 'answer',
    errors: [],
    stderrTail: '',
    events: [],
    ...overrides,
  }
}

describe('buildModelResult', () => {
  it('keeps successful results compact and omits absent optional fields', () => {
    expect(buildModelResult(base())).toEqual({
      ok: true,
      runId: 'r1',
      mode: 'new',
      sessionId: 's1',
      elapsedMs: 10,
      steps: 3,
      text: 'answer',
    })
  })

  it('returns accounting only when reported', () => {
    expect(buildModelResult(base({ costUsd: 0.5, turns: 2 }))).toMatchObject({ costUsd: 0.5, numTurns: 2 })
  })

  it('filters failure diagnostics and caps them at the last 15 events', () => {
    const notes: StoredEvent[] = Array.from({ length: 20 }, (_, index) => ({
      kind: 'note' as const,
      text: 'note-' + index,
      seq: index + 1,
      at: index * 1000,
    }))
    const events: StoredEvent[] = [
      { kind: 'text', text: 'hidden', seq: 50, at: 50 },
      { kind: 'reasoning', text: 'hidden', seq: 51, at: 51 },
      { kind: 'usage', inputTokens: 1, seq: 52, at: 52 },
      ...notes,
    ]
    const result = buildModelResult(base({
      ok: false,
      errors: ['boom'],
      stderrTail: Array.from({ length: 12 }, (_, index) => 'line-' + index).join('\n'),
      events,
    }))
    expect(result.errors).toEqual(['boom'])
    expect(result.stderrTail).toEqual(Array.from({ length: 8 }, (_, index) => 'line-' + (index + 4)))
    expect(result.events).toHaveLength(15)
    expect(result.events?.[0]).toContain('note-5')
    expect(result.events?.[14]).toContain('note-19')
  })

  it('adds diagnostics for an empty successful reply without empty errors or stderr', () => {
    const result = buildModelResult(base({
      text: '   ',
      errors: [],
      stderrTail: 'warning',
      events: [{ kind: 'note', text: 'empty reply', seq: 1, at: 0 }],
    }))
    expect(result.events).toEqual(['0s note empty reply'])
    expect(result).not.toHaveProperty('errors')
    expect(result).not.toHaveProperty('stderrTail')
  })
})
