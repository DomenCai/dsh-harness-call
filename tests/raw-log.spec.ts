import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { captureEnv, openRawRunLog, RAW_LOG_VERSION, type RawLogStart } from '../src/host/raw-log.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-harness-call-'))
  directories.push(path)
  return path
}

function start(path: string, overrides: Partial<RawLogStart> = {}): RawLogStart {
  return {
    directory: path,
    cwd: path,
    runId: 'r1',
    callId: 'c1',
    harness: 'grok',
    label: 'Grok',
    mode: 'new',
    sessionId: 's1',
    prompt: 'hello',
    access: undefined,
    effort: undefined,
    timeoutSeconds: 900,
    startedAt: Date.now(),
    rawLogFiles: 2,
    rawLogBytes: 4096,
    ...overrides,
  }
}

describe('raw log capture', () => {
  it('preserves env tombstones before credential redaction', () => {
    expect(captureEnv({ ANTHROPIC_AUTH_TOKEN: undefined, API_KEY: 'secret', PLAIN: 'value' }))
      .toEqual({ ANTHROPIC_AUTH_TOKEN: null, API_KEY: '[REDACTED]', PLAIN: 'value' })
  })

  it('versions the header and writes truncation then end markers outside the budget', async () => {
    const path = await directory()
    const opened = await openRawRunLog(start(path, { rawLogBytes: 700 }))
    expect(opened.capture).toBeDefined()
    const capture = opened.capture!
    for (let index = 0; index < 20; index += 1) capture.write('stdout', { raw: 'x'.repeat(120), index })
    await capture.close({ ok: true, elapsedMs: 1 })
    const records = (await readFile(capture.path, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records[0]).toMatchObject({ type: 'run.start', captureVersion: RAW_LOG_VERSION })
    expect(records.at(-2)).toMatchObject({ type: 'capture.truncated', byteBudget: 700 })
    expect(Number(records.at(-2)?.droppedRecords)).toBeGreaterThan(0)
    expect(records.at(-1)).toMatchObject({ type: 'capture.end', ok: true })
  })

  it('never rotates active files and reserves a slot before opening', async () => {
    const path = await directory()
    const first = await openRawRunLog(start(path, { runId: 'r1', startedAt: 1 }))
    const second = await openRawRunLog(start(path, { runId: 'r2', startedAt: 2 }))
    expect(first.capture).toBeDefined()
    expect(second.capture).toBeDefined()
    const blocked = await openRawRunLog(start(path, { runId: 'r3', startedAt: 3 }))
    expect(blocked.capture).toBeUndefined()
    expect(blocked.error).toContain('every retained capture is active')
    expect((await readdir(path)).filter(name => name.endsWith('.ndjson'))).toHaveLength(2)

    await first.capture!.close({ ok: true })
    const third = await openRawRunLog(start(path, { runId: 'r3', startedAt: 3 }))
    expect(third.capture).toBeDefined()
    const names = (await readdir(path)).filter(name => name.endsWith('.ndjson'))
    expect(names).toHaveLength(2)
    expect(names.some(name => name.includes('-r2-'))).toBe(true)
    expect(names.some(name => name.includes('-r3-'))).toBe(true)
    await second.capture!.close({ ok: true })
    await third.capture!.close({ ok: true })
  })

  it('deletes a capture when run.start alone exceeds the budget', async () => {
    const path = await directory()
    const opened = await openRawRunLog(start(path, { rawLogBytes: 1, prompt: 'too large' }))
    expect(opened.capture).toBeUndefined()
    expect(opened.error).toContain('run.start exceeds byte budget')
    expect((await readdir(path)).filter(name => name.endsWith('.ndjson'))).toHaveLength(0)
  })
})
