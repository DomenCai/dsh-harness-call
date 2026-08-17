/**
 * dsh-harness-call — host half.
 *
 * Registers the `harness_call` model tool that delegates work to external
 * coding agent CLIs through the adapter registry in ./adapters.js, keeps
 * per-harness session memory (auto-continue the most recent session), and
 * exposes live run snapshots to the browser half through a Typert Remote
 * service (`harnessCall/status`) polled by the cards and the details panel.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ADAPTERS, HARNESS_KEYS, LABELS, newState, brief, uuidV4 } from './adapters.js'

export const name = 'dsh-harness-call'
export const inject = ['subprocess', 'tools', 'systemPrompt', 'typert']

const TOOL_NAME = 'harness_call'
const SERVICE_KEY = 'harnessCall'
const MAX_TIMELINE_EVENTS = 400
const RESULT_TIMELINE_EVENTS = 60

const ROUTING_SECTION = [
  '## Harness mentions (@claude / @codex / @grok)',
  '',
  'The user marks external coding agents with @claude, @codex, or @grok inside a message. A mention is an intent marker, NOT a command syntax: you interpret the message and decide how to handle it, never mechanically forward text.',
  '',
  '- Binding by position: a mention naturally scopes over the text that follows it, up to the next mention. "@claude look at this crash log @codex write me a repro test" is two different prompts for two different harnesses. Mentions that cluster before one shared question ("@claude @codex what do you each think of X") all receive that same question.',
  "- Compose the prompt yourself: the external agent sees nothing of this conversation. For each call, build a self-contained prompt — extract the actual question, and add whatever context it needs (relevant code, prior decisions, constraints, file paths). Rewriting, reorganizing, splitting, or expanding the user's phrasing into a clear standalone task is expected and correct; passing the raw remainder verbatim usually is not.",
  '- One distinct (harness, prompt) pair → one harness_call. Independent calls run in parallel when possible; when the same question goes to several harnesses, synthesize or compare their replies for the user afterward.',
  '- Use judgment on ambiguity: if the binding of mentions to questions is unclear, pick the most natural reading, or ask one short clarifying question before calling. If a harness is mentioned with no discernible task, ask what to send rather than inventing one.',
  '- A mention inside a sentence used as plain vocabulary (quoting, discussing the tool itself, not marking a task) is not a routing signal.',
  '- Session policy stays at defaults: each harness auto-continues its own most recent session, so follow-up questions naturally reuse context unless the user asks for a fresh start.',
].join('\n')

const TOOL_DESCRIPTION = [
  '调用外部 coding agent（Claude Code / Codex CLI / Grok CLI）执行一次独立提问或委托任务，返回其最终回复文本与过程摘要。',
  'Call an external coding agent (Claude Code / Codex CLI / Grok CLI) with a self-contained prompt and return its final reply plus a process summary.',
  'prompt 必须自包含：外部 agent 看不到当前对话 / The external agent sees nothing of the current conversation.',
  '会话策略：默认自动续接同一 harness 最近一次成功会话；newSession=true 强制新会话；传 sessionId 显式续接。/ Sessions auto-continue per harness by default; newSession=true forces a fresh one.',
  'codex 默认只读沙箱，仅当用户明确授权写入时传 codexSandbox="workspace-write"。/ codex defaults to a read-only sandbox; workspace-write requires explicit user authorization.',
  'timeoutSeconds 默认 900（60-3600）。cwd 默认当前工作区。',
].join(' ')

/** Typert Remote service: live run snapshots for the browser half. */
class HarnessCallRuntime extends TypertRemoteService {
  /** @param {import('@deepseek-ai/cordis').Context} ctx */
  constructor(ctx, runs) {
    super(ctx, SERVICE_KEY)
    this.runs = runs
  }

  /** One snapshot per harness key, or null before the first run. */
  async status(harness) {
    if (typeof harness !== 'string') return null
    return Object.prototype.hasOwnProperty.call(this.runs, harness) ? this.runs[harness] : null
  }
}

/** Host-side Typert contribution: strict invocation for harnessCall/status. */
const TYPERT_MANIFEST = {
  package: name,
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: SERVICE_KEY,
        exportName: 'HarnessCallRuntime',
        description: 'Live run snapshots for harness_call cards and the details panel.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'status',
            signature: 'status(harness: string): Promise<RunSnapshot | null>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: [
    {
      id: 'dsh-harness-call#harnessCall/status',
      service: SERVICE_KEY,
      namespace: SERVICE_KEY,
      method: 'status',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'harness', wire: 'harness', source: 'json', codec: { mode: 'src-json' } },
      ],
      result: { mode: 'src-json' },
    },
  ],
}

/**
 * Build the tool's execute body over the adapter registry.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
function makeCallHarness(ctx) {
  const subprocess = ctx.get('subprocess')

  return async function callHarness(args, exec) {
    const harness = args.harness
    const adapter = Object.prototype.hasOwnProperty.call(ADAPTERS, harness) ? ADAPTERS[harness] : undefined
    if (adapter === undefined) {
      return { ok: false, harness: String(harness), errors: ['unknown harness: ' + String(harness)] }
    }
    if (typeof args.prompt !== 'string' || args.prompt.trim().length === 0) {
      return { ok: false, harness, errors: ['prompt must be a non-empty string'] }
    }

    const agentCwd = exec.agent?.session?.header?.cwd
    const cwd = typeof args.cwd === 'string' && args.cwd.trim().length > 0 ? args.cwd : agentCwd
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return { ok: false, harness, errors: ['no cwd available: pass the cwd argument'] }
    }

    // Session policy: explicit sessionId > newSession > last session > new.
    // `lastSessions` lives in the apply() closure: process-lifetime memory.
    let mode = 'new'
    let sessionId = null
    if (typeof args.sessionId === 'string' && args.sessionId.length > 0) {
      mode = 'resume'
      sessionId = args.sessionId
    } else if (args.newSession === true) {
      mode = 'new'
    } else if (typeof callHarness.lastSessions[harness] === 'string') {
      mode = 'resume'
      sessionId = callHarness.lastSessions[harness]
    }
    if (mode === 'new') sessionId = uuidV4()

    const timeoutSeconds = Math.min(3600, Math.max(60, Math.round(Number(args.timeoutSeconds) || 900)))
    const req = {
      prompt: args.prompt,
      cwd,
      mode,
      sessionId,
      sandbox: args.codexSandbox === 'workspace-write' ? 'workspace-write' : 'read-only',
      timeoutSeconds,
    }

    const startedAt = Date.now()
    const snapshot = {
      phase: 'starting',
      harness,
      label: LABELS[harness],
      mode,
      sessionId,
      requestedSessionId: sessionId,
      cwd,
      promptCharacters: args.prompt.length,
      startedAt,
      events: [],
    }
    callHarness.runs[harness] = snapshot

    const spec = adapter.build(req)
    let bin = adapter.bin
    try {
      bin = await subprocess.resolveExecutable(adapter.bin, undefined, exec.signal)
    } catch {
      bin = adapter.bin
    }
    const argv = [bin].concat(spec.argv)

    const env = { CLICOLOR: '0', NO_COLOR: '1' }
    for (const key of Object.keys(spec.env ?? {})) env[key] = spec.env[key]

    const handle = subprocess.spawn({
      argv,
      cwd,
      stdio: {
        stdin: spec.stdin === null ? 'ignore' : { data: spec.stdin },
        stdout: 'pipe',
        stderr: 'pipe',
      },
      graceMs: 10000,
      signal: exec.signal,
      env,
    })

    snapshot.phase = 'running'
    snapshot.pid = handle.pid

    const state = newState()
    let timedOut = false
    let stderrTail = ''

    const digest = (kind, text, max) => {
      const item = { k: kind, s: brief(text, max ?? 140), t: Math.round((Date.now() - startedAt) / 1000) }
      snapshot.events.push(item)
      if (snapshot.events.length > MAX_TIMELINE_EVENTS) snapshot.events.shift()
      snapshot.eventCount = (snapshot.eventCount ?? 0) + 1
    }

    const consumeLine = (rawLine) => {
      const line = rawLine.trim()
      if (line.length === 0) return
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      snapshot.nativeEventCount = (snapshot.nativeEventCount ?? 0) + 1
      snapshot.lastEventType = typeof event.type === 'string' ? event.type : 'unknown'
      snapshot.elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
      try {
        adapter.onEvent(event, state, digest)
      } catch (error) {
        digest('err', 'event parse failed: ' + brief(error && error.message, 100), 120)
      }
    }

    let buffer = ''
    if (handle.stdout !== undefined) {
      handle.stdout.setEncoding('utf8')
      handle.stdout.on('data', (chunk) => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          consumeLine(line)
        }
      })
    }
    if (handle.stderr !== undefined) {
      handle.stderr.setEncoding('utf8')
      handle.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk).slice(-4000)
      })
    }

    const killOff = ctx.timeout(() => {
      timedOut = true
      digest('err', 'timeout, terminating process', 80)
      try {
        handle.terminate()
      } catch {
        /* already gone */
      }
    }, timeoutSeconds * 1000)

    let outcome
    try {
      outcome = await handle.done
    } finally {
      killOff()
    }

    const info = { timedOut, timeoutSeconds, sessionId, aborted: exec.signal.aborted }
    let finished
    try {
      finished = adapter.finalize(state, outcome, info)
    } catch (error) {
      finished = {
        ok: false,
        text: state.text,
        sessionId,
        errors: ['finalize failed: ' + String(error && error.message)],
        extras: {},
      }
    }
    if (info.aborted && !finished.ok) finished.errors.push('cancelled by caller')

    const errors = finished.errors.map((item) => String(item))
    const ok = finished.ok && errors.length === 0

    snapshot.phase = 'done'
    snapshot.ok = ok
    snapshot.errors = errors
    snapshot.elapsedMs = Date.now() - startedAt
    snapshot.text = finished.text
    snapshot.finishedAt = Date.now()

    if (ok && typeof finished.sessionId === 'string') callHarness.lastSessions[harness] = finished.sessionId

    const value = {
      ok,
      harness,
      label: LABELS[harness],
      mode,
      sessionId: typeof finished.sessionId === 'string' ? finished.sessionId : null,
      cwd,
      elapsedMs: snapshot.elapsedMs,
      costUsd: finished.extras.costUsd ?? null,
      numTurns: finished.extras.numTurns ?? null,
      steps: snapshot.events.length,
    }
    value.errors = errors
    if (errors.length > 0 && stderrTail.trim().length > 0) {
      value.stderrTail = stderrTail.trim().split('\n').slice(-8)
    }
    value.events = snapshot.events.slice(-RESULT_TIMELINE_EVENTS)
    value.text = finished.text
    return value
  }
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  // Shared closure state: latest run snapshot + last successful session per harness.
  const runs = {}
  const lastSessions = {}
  const callHarness = makeCallHarness(ctx)
  callHarness.runs = runs
  callHarness.lastSessions = lastSessions

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'tool:harness-call',
        order: 116,
        text: ROUTING_SECTION,
      }),
    'dsh-harness-call: routing section',
  )

  new HarnessCallRuntime(ctx, runs)

  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => {
      void dispose()
    }
  }, 'dsh-harness-call: typert manifest')

  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: {
        harness: {
          type: 'string',
          required: true,
          enum: HARNESS_KEYS,
          description: '要调用的外部 harness / the external harness to call',
        },
        prompt: {
          type: 'string',
          required: true,
          description: '发给外部 agent 的完整自包含提示词 / the fully self-contained prompt',
        },
        cwd: { type: 'string', description: '工作目录（默认当前会话工作区）/ working directory (defaults to the session workspace)' },
        newSession: { type: 'boolean', description: '强制新会话 / force a new session' },
        sessionId: { type: 'string', description: '显式续接的会话 ID / explicit session id to resume' },
        timeoutSeconds: { type: 'number', description: '超时秒数 60-3600，默认 900 / timeout in seconds, default 900' },
        codexSandbox: {
          type: 'string',
          enum: ['read-only', 'workspace-write'],
          description: '仅 codex 新会话的沙箱模式 / codex new-session sandbox mode',
        },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      timeoutMs: 3900000,
      async execute(args, exec) {
        return callHarness(args, exec)
      },
    }),
  )
}
