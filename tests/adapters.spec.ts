import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADAPTERS } from '../src/host/adapters/index.js'
import { captureArgv, captureEnv } from '../src/host/raw-log.js'
import type { HarnessKey } from '../src/shared/harness.js'
import type { Outcome, RunRequest } from '../src/host/adapter.js'

const FIXTURES = [
  'claude-minimal',
  'codex-minimal',
  'grok-minimal',
  'kimi-minimal',
] as const

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function promptRef(value: string | null, prompt: string): unknown {
  return value === prompt ? { ref: 'run.start.prompt' } : value
}

function claudeReq(partial: Partial<RunRequest> = {}): RunRequest {
  return {
    prompt: 'p',
    cwd: '/tmp',
    mode: 'new',
    sessionId: 'sid',
    access: undefined,
    effort: undefined,
    timeoutSeconds: 900,
    ...partial,
  }
}

function toolsArg(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--tools')
  return index < 0 ? undefined : argv[index + 1]
}

describe('claude build argv', () => {
  it('maps read-only to dontAsk plus a comma-separated read-only tool list', () => {
    const { argv } = ADAPTERS.claude.build(claudeReq({
      access: 'read-only',
      effort: 'high',
    }))
    expect(argv).not.toContain('plan')
    expect(argv).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk']))
    expect(argv).toEqual(expect.arrayContaining(['--session-id', 'sid', '--effort', 'high']))
    const tools = toolsArg(argv)
    expect(tools).toBe('Read,Glob,Grep,WebFetch,WebSearch')
    expect(tools).not.toMatch(/\b(?:Bash|Write|Edit|NotebookEdit)\b/)
    expect(argv[argv.indexOf('--tools') + 2]).toBe('--effort')
  })

  it('keeps resume, acceptEdits, and bypassPermissions unchanged', () => {
    const resume = ADAPTERS.claude.build(claudeReq({
      mode: 'resume',
      sessionId: 'resume-sid',
      access: 'workspace-write',
      effort: 'low',
    })).argv
    expect(resume).toEqual(expect.arrayContaining(['--resume', 'resume-sid', '--permission-mode', 'acceptEdits', '--effort', 'low']))
    expect(resume).not.toContain('--session-id')
    expect(resume).not.toContain('--tools')

    const full = ADAPTERS.claude.build(claudeReq({ access: 'full-access' })).argv
    expect(full).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    expect(full).not.toContain('--tools')
    expect(full).not.toContain('plan')
  })
})

describe('adapter edge semantics', () => {
  it('keeps a Codex failed status even when exit_code is zero', () => {
    const state = ADAPTERS.codex.createState()
    const events = ADAPTERS.codex.translate({
      type: 'item.completed',
      item: { type: 'command_execution', id: 'c1', command: 'false', status: 'failed', exit_code: 0 },
    }, state)
    expect(events.at(-1)).toEqual({
      kind: 'tool_finish', callId: 'c1', name: 'command_execution', exitCode: 0, failed: true,
    })
  })
})

describe('adapter raw-log replay', () => {
  for (const stem of FIXTURES) {
    it(stem, async () => {
      const root = join(process.cwd(), 'tests/fixtures')
      const fixture = JSON.parse(await readFile(join(root, stem + '.spawn.json'), 'utf8')) as {
        harness: HarnessKey
        prompt: string
        cwd: string
        mode: 'new' | 'resume'
        sessionId: string
        access?: RunRequest['access']
        effort?: RunRequest['effort']
        timeoutSeconds: number
        outcome: Outcome
        timedOut: boolean
        aborted: boolean
      }
      const expected = JSON.parse(await readFile(join(root, stem + '.expected.json'), 'utf8')) as {
        events: unknown[]
        spawn: unknown
        result: unknown
      }
      const lines = (await readFile(join(root, stem + '.stdout.jsonl'), 'utf8')).trimEnd().split('\n')
      const req: RunRequest = {
        prompt: fixture.prompt,
        cwd: fixture.cwd,
        mode: fixture.mode,
        sessionId: fixture.sessionId,
        access: fixture.access,
        effort: fixture.effort,
        timeoutSeconds: fixture.timeoutSeconds,
      }
      const adapter = ADAPTERS[fixture.harness]
      const state = adapter.createState()
      const events = lines.flatMap(line => adapter.translate(JSON.parse(line), state))
      const spawn = adapter.build(req)
      const result = adapter.finalize(state, fixture.outcome, {
        timedOut: fixture.timedOut,
        timeoutSeconds: fixture.timeoutSeconds,
        sessionId: fixture.sessionId,
        aborted: fixture.aborted,
      })
      expect(clean(events)).toEqual(expected.events)
      expect(clean({
        argv: captureArgv(spawn.argv, fixture.prompt),
        stdin: promptRef(spawn.stdin, fixture.prompt),
        env: captureEnv(spawn.env),
      })).toEqual(expected.spawn)
      expect(clean(result)).toEqual(expected.result)
    })
  }
})
