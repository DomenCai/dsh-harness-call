/**
 * The `harness_call` model tool and the prompt section that teaches routing.
 *
 * This is the orchestrator: it picks the adapter, resolves the session policy,
 * spawns the child process, splits stdout into JSONL lines, feeds each one
 * through `adapter.translate` into the {@link RunStore}, enforces the deadline,
 * and turns `adapter.finalize` into the model-facing result. Everything
 * harness-specific lives behind the adapter contract, so this file never names
 * a CLI.
 *
 * @module dsh-harness-call/host/tool
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolDefinition } from '@deepseek-ai/dsh-tools'
// Declaration merges only: makes ctx.subprocess and ctx.tools visible.
import type {} from '@deepseek-ai/dsh-subprocess'
import type { HarnessEvent, RunMode } from '../shared/events.js'
import { HARNESS_KEYS, HARNESS_LABELS } from '../shared/harness.js'
import {
  ACCESS_MODES,
  EFFORT_LEVELS,
  isAccessMode,
  isEffortLevel,
  resolveRunPolicy,
  type AccessMode,
  type EffortLevel,
  type HarnessCallSettings,
} from '../shared/policy.js'
import type { Outcome, RunRequest, RunResult } from './adapter.js'
import { ADAPTERS } from './adapters/index.js'
import { captureArgv, captureEnv, openRawRunLog, type RawRunLog } from './raw-log.js'
import type { RunStore } from './runs.js'
import { utf8ByteLength } from './truncate.js'

/** Model-facing tool name; also the key the browser card renders against. */
export const TOOL_NAME = 'harness_call'

/**
 * How much of the timeline the model-facing result carries.
 *
 * The store keeps structured events for the browser, which can page and render
 * them; the tool result goes into the conversation, where an unbounded timeline
 * would cost more context than the reply it accompanies. So the result gets a
 * bounded tail of one-line digests, and `runId` for anything richer.
 */
const RESULT_TIMELINE_EVENTS = 40
/** Per-line ceiling inside that tail. */
const TIMELINE_LINE_CHARACTERS = 160
/** Trailing stderr lines surfaced when a run failed. */
const STDERR_TAIL_LINES = 8
/** Bytes of stderr kept in memory while the run streams. */
const STDERR_TAIL_CHARACTERS = 4000
/** SIGTERM → SIGKILL escalation window for the child process tree. */
const TERMINATE_GRACE_MS = 10000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Flatten any value onto one truncated line — the tool result's only lossy step. */
function brief(value: unknown, max: number): string {
  let raw: string
  if (typeof value === 'string') {
    raw = value
  } else {
    try {
      raw = JSON.stringify(value) ?? String(value)
    } catch {
      raw = String(value)
    }
  }
  const text = raw.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** One normalized event as a single compact line for the model-facing digest. */
function describeEvent(event: HarnessEvent, seconds: number): string {
  const at = `${seconds}s`
  switch (event.kind) {
    case 'session':
      return `${at} session ${event.sessionId}`
    case 'reasoning':
      return `${at} thinking ${brief(event.text, TIMELINE_LINE_CHARACTERS)}`
    case 'text':
      return `${at} text ${brief(event.text, TIMELINE_LINE_CHARACTERS)}`
    case 'tool': {
      const parts = [at, 'tool', event.name]
      if (event.exitCode !== undefined) parts.push(`exit=${event.exitCode}`)
      if (event.input !== undefined) parts.push(brief(event.input, TIMELINE_LINE_CHARACTERS))
      return parts.join(' ')
    }
    case 'tool_start': {
      const parts = [at, 'tool', event.name]
      if (event.input !== undefined) parts.push(brief(event.input, TIMELINE_LINE_CHARACTERS))
      return parts.join(' ')
    }
    case 'tool_finish': {
      const parts = [at, 'tool', event.name]
      if (event.exitCode !== undefined) parts.push(`exit=${event.exitCode}`)
      if (event.output !== undefined) {
        const bytes = event.outputOriginalBytes ?? utf8ByteLength(event.output)
        parts.push(`output=${formatBytes(bytes)}`)
      }
      return parts.join(' ')
    }
    case 'file':
      return `${at} file ${event.change} ${event.path}`
    case 'error':
      return `${at} error ${brief(event.message, TIMELINE_LINE_CHARACTERS)}`
    case 'usage': {
      const parts = [at, 'usage']
      if (event.costUsd !== undefined) parts.push(`cost=${event.costUsd}`)
      if (event.turns !== undefined) parts.push(`turns=${event.turns}`)
      if (event.inputTokens !== undefined) parts.push(`in=${event.inputTokens}`)
      if (event.outputTokens !== undefined) parts.push(`out=${event.outputTokens}`)
      if (event.cachedTokens !== undefined) parts.push(`cached=${event.cachedTokens}`)
      if (event.reasoningTokens !== undefined) parts.push(`reason=${event.reasoningTokens}`)
      if (event.model !== undefined) parts.push(event.model)
      return parts.length === 2 ? `${at} usage` : parts.join(' ')
    }
    case 'note':
      return `${at} note ${brief(event.text, TIMELINE_LINE_CHARACTERS)}`
  }
}

/** Compact byte count for the model-facing digest (`5.4K`, `1.2M`). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) {
    const k = bytes / 1024
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}K`
  }
  const m = bytes / (1024 * 1024)
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`
}

/**
 * Routing guidance registered into the global system prompt.
 *
 * It teaches the model that `@claude` / `@codex` / `@grok` / `@kimi` are
 * intent markers, not a forwarding syntax: the external agent sees nothing of
 * this conversation, so the model must compose a self-contained prompt rather
 * than pass the remainder of the message through.
 */
export const ROUTING_SECTION: string = [
  '## Harness mentions (@claude / @codex / @grok / @kimi)',
  '',
  'The user marks external coding agents with @claude, @codex, @grok, or @kimi inside a message. A mention is an intent marker, NOT a command syntax: you interpret the message and decide how to handle it, never mechanically forward text.',
  '',
  '- Binding by position: a mention naturally scopes over the text that follows it, up to the next mention. "@claude look at this crash log @codex write me a repro test" is two different prompts for two different harnesses. Mentions that cluster before one shared question ("@claude @codex what do you each think of X") all receive that same question.',
  "- Compose the prompt yourself: the external agent sees nothing of this conversation. For each call, build a self-contained prompt — extract the actual question, and add whatever context it needs (relevant code, prior decisions, constraints, file paths). Rewriting, reorganizing, splitting, or expanding the user's phrasing into a clear standalone task is expected and correct; passing the raw remainder verbatim usually is not.",
  '- One distinct (harness, prompt) pair → one harness_call. Independent calls run in parallel; when the same question goes to several harnesses, synthesize or compare their replies for the user afterward.',
  '- Use judgment on ambiguity: if the binding of mentions to questions is unclear, pick the most natural reading, or ask one short clarifying question before calling. If a harness is mentioned with no discernible task, ask what to send rather than inventing one.',
  '- A mention inside a sentence used as plain vocabulary (quoting, discussing the tool itself, not marking a task) is not a routing signal.',
  '- Session policy stays at defaults: each harness auto-continues its own most recent successful session, so follow-up questions naturally reuse context unless the user asks for a fresh start. If two calls target the same harness in one step, only the first auto-continues; the rest open a fresh session so they do not share a live CLI conversation. Explicit sessionId is never rewritten.',
].join('\n')

const TOOL_DESCRIPTION: string = [
  '调用外部 coding agent（Claude Code / Codex CLI / Grok CLI / Kimi CLI）执行一次独立提问或委托任务，返回其最终回复文本与过程摘要。',
  'Call an external coding agent (Claude Code / Codex CLI / Grok CLI / Kimi CLI) with a self-contained prompt and return its final reply plus a process summary.',
  'prompt 必须自包含：外部 agent 看不到当前对话 / The external agent sees nothing of the current conversation.',
  '会话策略：默认自动续接同一 harness 最近一次成功会话；newSession=true 强制新会话；传 sessionId 显式续接。同一步内多次 harness_call 并行执行；同一 harness 已有进行中的调用时，后续自动续接改为新开会话。/ Sessions auto-continue per harness by default; newSession=true forces a fresh one. Independent calls run in parallel; a second auto-continue to a busy harness opens a new session instead of sharing the live CLI conversation.',
  '权限与思考档位以设置页为准；仅当对应项设为「模型决定」时才读 access / effort（或旧的 codexSandbox）。/ Access and effort come from Settings; pass access/effort only when that setting is "model decides".',
  'kimi 的 headless 模式没有权限开关，access 对 kimi 无效。/ kimi has no headless permission switch; access is ignored for kimi.',
  'timeoutSeconds 默认 900（60-3600）。cwd 默认当前工作区。',
].join(' ')

/**
 * Pick the harness session this call should open.
 *
 * Precedence: explicit `sessionId` > `newSession` > last successful session
 * of this harness, provided no other run of the same harness is still live >
 * a freshly generated id.
 *
 * The live-run gate is what makes parallel `harness_call`s safe: two calls
 * that would otherwise `--resume` the same CLI conversation fork the second
 * onto a new session instead of sharing a process the CLIs do not support.
 * Explicit resume is never rewritten — the caller named the id.
 */
function resolveSession(input: {
  readonly sessionId: unknown
  readonly newSession: unknown
  readonly remembered: string | undefined
  readonly harnessBusy: boolean
}): { mode: RunMode, sessionId: string, skippedResume?: string } {
  if (typeof input.sessionId === 'string' && input.sessionId.length > 0) {
    return { mode: 'resume', sessionId: input.sessionId }
  }
  if (input.newSession === true || input.remembered === undefined) {
    return { mode: 'new', sessionId: randomUUID() }
  }
  if (input.harnessBusy) {
    return { mode: 'new', sessionId: randomUUID(), skippedResume: input.remembered }
  }
  return { mode: 'resume', sessionId: input.remembered }
}

/**
 * Build the tool over a live context and run store.
 *
 * @param ctx - the plugin fiber's context; supplies `subprocess` and deadlines.
 * @param store - the run store this tool writes and the browser reads.
 * @param readSettings - live settings read; applied on every spawn.
 * @returns a registry-ready tool definition.
 */
export function createHarnessCallTool(
  ctx: Context,
  store: RunStore,
  readSettings: () => HarnessCallSettings,
): ToolDefinition {
  const logger = ctx.logger('dsh-harness-call')

  /**
   * Most recent SUCCESSFUL session per harness — the default auto-continue
   * target. Closure state, so it lives and dies with the plugin fiber: a
   * remembered session id is only meaningful while the harness CLI's own
   * session store still holds it. Concurrent finishes last-write-wins, which
   * is the same "most recent successful" rule as serial dispatch. Auto-resume
   * is skipped while this harness has another execute still in flight.
   */
  const lastSessions = new Map<string, string>()
  /**
   * In-flight `execute` count per harness. Claimed in the same synchronous
   * turn as the auto-resume decision, before any `await`, so two overlapping
   * calls cannot both observe an idle harness and `--resume` one session.
   */
  const inflight = new Map<string, number>()

  return defineTool({
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
      cwd: {
        type: 'string',
        description: '工作目录（默认当前会话工作区）/ working directory (defaults to the session workspace)',
      },
      newSession: { type: 'boolean', description: '强制新会话 / force a new session' },
      sessionId: { type: 'string', description: '显式续接的会话 ID / explicit session id to resume' },
      timeoutSeconds: {
        type: 'number',
        description: '超时秒数 60-3600，默认 900 / timeout in seconds, default 900',
      },
      access: {
        type: 'string',
        enum: ACCESS_MODES,
        description: '仅当设置页该项为「模型决定」时生效：只读 / 仓库可写 / 完全访问 / Only used when Settings access is "model decides"',
      },
      effort: {
        type: 'string',
        enum: EFFORT_LEVELS,
        description: '仅当设置页该项为「模型决定」时生效：low / medium / high / xhigh，kimi 仅支持 low / high / max / Only used when Settings effort is "model decides"; kimi accepts only low / high / max',
      },
      codexSandbox: {
        type: 'string',
        enum: ACCESS_MODES,
        description: 'access 的旧名，语义相同 / deprecated alias of access',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    // Above the 3600s parameter ceiling so the harness's own deadline, which
    // can name the offending harness, always fires first.
    timeoutMs: 3900000,
    /**
     * Each call owns its child process and run record. Shared `lastSessions`
     * last-write-wins, and a busy same-harness auto-resume forks a new
     * session, so overlapping dispatch cannot corrupt a live CLI conversation.
     */
    isConcurrencySafe: () => true,
    // The return type is stated rather than inferred: the early-exit shapes and
    // the full result shape differ, and an inferred union would pad each with
    // `undefined`-valued keys that the `json` output schema cannot carry.
    async execute(args, exec): Promise<JsonValue> {
      const harness = args.harness
      const label = HARNESS_LABELS[harness]
      // The registry is total over the roster and `harness` is enum-validated,
      // so there is no unknown-harness branch to defend against here.
      const adapter = ADAPTERS[harness]

      if (args.prompt.trim().length === 0) {
        return { ok: false, harness, label, errors: ['prompt must be a non-empty string'] }
      }
      const cwd =
        typeof args.cwd === 'string' && args.cwd.trim().length > 0
          ? args.cwd
          : exec.agent?.session.header.cwd
      if (cwd === undefined || cwd.length === 0) {
        return { ok: false, harness, label, errors: ['no cwd available: pass the cwd argument'] }
      }

      const timeoutSeconds = Math.min(3600, Math.max(60, Math.round(Number(args.timeoutSeconds) || 900)))
      const accessOverride: AccessMode | undefined = isAccessMode(args.access)
        ? args.access
        : isAccessMode(args.codexSandbox)
          ? args.codexSandbox
          : undefined
      const effortOverride: EffortLevel | undefined = isEffortLevel(args.effort) ? args.effort : undefined
      const settings = readSettings()
      const policy = resolveRunPolicy(settings, harness, {
        access: accessOverride,
        effort: effortOverride,
      })

      // Session policy: explicit sessionId > newSession > last session (if
      // this harness is idle) > new. The inflight claim is taken in this
      // same turn, before any `await`, so a sibling execute cannot also
      // observe idle and `--resume` the same CLI session.
      const live = inflight.get(harness) ?? 0
      inflight.set(harness, live + 1)
      try {
        const { mode, sessionId, skippedResume } = resolveSession({
          sessionId: args.sessionId,
          newSession: args.newSession,
          remembered: lastSessions.get(harness),
          harnessBusy: live > 0,
        })
        const req: RunRequest = {
          prompt: args.prompt,
          cwd,
          mode,
          sessionId,
          access: policy.access,
          effort: policy.effort,
          timeoutSeconds,
        }

        const startedAt = Date.now()
        const callId = String(exec.callId)
        const run = store.open({
          harness,
          label,
          mode,
          sessionId,
          cwd,
          prompt: args.prompt,
          // The one reliable link from a still-running card back to ITS run: the
          // tool result carries `runId`, but a card that has not settled yet only
          // knows the call it was rendered for.
          callId,
        })
        if (skippedResume !== undefined) {
          run.append([{
            kind: 'note',
            text: `another ${label} run is in progress; opened a new session instead of resuming ${skippedResume}`,
          }])
        }
        let rawLog: RawRunLog | undefined
        if (settings.logs.enabled) {
          const openedLog = await openRawRunLog({
            directory: settings.logs.directory,
            runId: run.runId,
            callId,
            harness,
            label,
            mode,
            sessionId,
            cwd,
            prompt: args.prompt,
            access: policy.access,
            effort: policy.effort,
            timeoutSeconds,
            startedAt,
          })
          if (openedLog.capture !== undefined) {
            rawLog = openedLog.capture
            logger.info('run %s raw log: %s', run.runId, rawLog.path)
          } else if (openedLog.error !== undefined) {
            logger.warn('run %s continues without raw capture: %s', run.runId, openedLog.error)
          }
        }

        /**
         * The model-facing timeline is NOT built from the raw stream. Grok's
         * `streaming-json` emits one frame per token, so raw counting made
         * `steps` a token count (observed: 3062 for one 81s run) and let the
         * reply's last seconds evict every session/tool event from the bounded
         * digest. The store already folds adjacent deltas into semantic events,
         * so the digest is read back out of it after the run finishes — see the
         * `store.get` call below.
         */
        const record = (events: readonly HarnessEvent[]): void => {
          if (events.length === 0) return
          run.append(events)
        }

        /*
         * From here to the end of `execute`, EVERY failure has to be turned into a
         * finished run, because the run record already exists. A throw escaping
         * this function would skip `run.finish()`, so the record would sit at
         * `running` forever: the store only ever evicts runs in `done`, so it
         * could never be reclaimed, `list()` would publish a run that no longer
         * exists to the browser, and every card would keep polling it.
         *
         * The failures are real, not theoretical. `child.done` REJECTS on
         * spawn-level failure, which is exactly what a harness CLI that is not
         * installed produces (the executable lookup above deliberately falls back
         * to the bare name) and what a `cwd` that does not exist produces (it
         * comes straight from model arguments and is only checked for being a
         * non-empty string). And `ctx.effect` throws `INACTIVE_EFFECT` when the
         * fiber was disposed while an `await` here was pending, which is why the
         * try must start before the first one.
         */
        try {
          const spec = adapter.build(req)
          rawLog?.write('spawn.spec', {
            executable: adapter.bin,
            argv: captureArgv(spec.argv, req.prompt),
            stdin: spec.stdin === req.prompt ? { ref: 'run.start.prompt' } : spec.stdin,
            env: captureEnv(spec.env),
          })
          let bin: string
          try {
            bin = await ctx.subprocess.resolveExecutable(adapter.bin, undefined, exec.signal)
            rawLog?.write('spawn.resolved', { executable: bin })
          } catch (error) {
            // Lookup can fail in an execution world with a narrow PATH; the bare
            // name may still resolve for the child, so failing here would be worse
            // than letting the spawn report the real problem.
            rawLog?.write('spawn.resolve_failed', {
              executable: adapter.bin,
              error: errorMessage(error),
              fallback: adapter.bin,
            })
            bin = adapter.bin
          }

          const child = ctx.subprocess.spawn({
            argv: [bin, ...spec.argv],
            cwd,
            stdio: {
              stdin: spec.stdin === null ? 'ignore' : { data: spec.stdin },
              stdout: 'pipe',
              stderr: 'pipe',
            },
            graceMs: TERMINATE_GRACE_MS,
            signal: exec.signal,
            // Spread AFTER the colour defaults so an adapter can override either,
            // and so its `undefined` tombstones survive into the spawn spec.
            env: { CLICOLOR: '0', NO_COLOR: '1', ...spec.env },
          })
          rawLog?.write('process.spawned', { pid: child.pid })
          run.markRunning()

          const state = adapter.createState()
          let timedOut = false
          let stderrTail = ''
          let stdoutBuffer = ''
          /**
           * `child.done` has settled, so the run's outcome is decided.
           *
           * Two things must stop at that instant. Stdout, because the drain wait
           * behind `done` is BOUNDED: a harness that leaves grandchildren holding
           * the pipe (grok spawns subagents and MCP servers) can settle while
           * chunks are still coming, and appending those to the store after
           * `finish` has written the authoritative final text would append reply
           * text on top of the finished reply — a panel whose answer disagrees
           * with the tool result and keeps growing. And the child-termination
           * effect, because the process is already gone and the seam warns that a
           * dead pid may have been reused.
           */
          let settled = false

          const consumeLine = (rawLine: string, terminated: boolean): void => {
            const line = rawLine.trim()
            if (line.length === 0) {
              rawLog?.write('stdout', { raw: rawLine, terminated, parsed: false, empty: true })
              return
            }
            let native: unknown
            let sourceSeq: number | undefined
            try {
              native = JSON.parse(line)
              // Keep exactly one copy of the native frame. Anyone analyzing the
              // transcript can parse `raw` again; persisting `native` duplicated
              // the largest payload without adding evidence.
              sourceSeq = rawLog?.write('stdout', { raw: rawLine, terminated, parsed: true })
            } catch (error) {
              rawLog?.write('stdout', {
                raw: rawLine,
                terminated,
                parsed: false,
                parseError: errorMessage(error),
              })
              // Harness CLIs interleave non-JSON banners with their JSONL stream;
              // a line we cannot parse is noise to the semantic adapter, but the
              // opt-in raw transcript above keeps it for later diagnosis.
              return
            }
            try {
              const events = adapter.translate(native, state)
              if (events.length > 0) rawLog?.write('semantic', { sourceSeq: sourceSeq ?? null, events })
              record(events)
            } catch (error) {
              // A malformed native event must not abort a run that is otherwise
              // healthy — the harness owns the wire format and can change it.
              rawLog?.write('adapter.translate_failed', { sourceSeq: sourceSeq ?? null, error: errorMessage(error) })
              record([{ kind: 'error', message: `translate failed: ${errorMessage(error)}` }])
            }
          }

          if (child.stdout !== undefined) {
            child.stdout.setEncoding('utf8')
            child.stdout.on('data', (chunk: string) => {
              if (settled) return
              stdoutBuffer += chunk
              let index = stdoutBuffer.indexOf('\n')
              while (index !== -1) {
                consumeLine(stdoutBuffer.slice(0, index), true)
                stdoutBuffer = stdoutBuffer.slice(index + 1)
                index = stdoutBuffer.indexOf('\n')
              }
            })
          }
          if (child.stderr !== undefined) {
            child.stderr.setEncoding('utf8')
            child.stderr.on('data', (chunk: string) => {
              rawLog?.write('stderr', { raw: chunk })
              stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARACTERS)
            })
          }

          let outcome: Outcome
          let releaseChild: (() => Promise<void>) | undefined
          let releaseDeadline: (() => Promise<void>) | undefined
          try {
            // The child's own lifetime is a fiber effect, not just the deadline's.
            // Its lifetime otherwise hangs off `exec.signal`, which belongs to the
            // tool caller: unloading or hot-reloading the plugin would clear the
            // deadline and drop the store while the harness CLI kept running with
            // no time limit left at all, writing into an orphaned record.
            releaseChild = ctx.effect(() => () => {
              if (!settled) child.terminate()
            }, `${TOOL_NAME}: ${harness} child process`)

            releaseDeadline = ctx.effect(() => {
              const timer = setTimeout(() => {
                timedOut = true
                rawLog?.write('process.timeout', { timeoutSeconds })
                record([{ kind: 'error', message: `timeout after ${timeoutSeconds}s, terminating process` }])
                child.terminate()
              }, timeoutSeconds * 1000)
              return () => {
                clearTimeout(timer)
              }
            }, `${TOOL_NAME}: ${harness} deadline`)

            outcome = await child.done
            rawLog?.write('process.closed', { exitCode: outcome.exitCode, signal: outcome.signal })
          } catch (error) {
            rawLog?.write('process.failed', { error: errorMessage(error) })
            // The only reaper of this process is the effect disposer, and reaching
            // here means either that effect never registered or the process never
            // closed. Terminate before the failure propagates, so no path out of
            // this function leaves the CLI running unattended.
            child.terminate()
            throw error
          } finally {
            settled = true
            if (stdoutBuffer.length > 0) {
              consumeLine(stdoutBuffer, false)
              stdoutBuffer = ''
            }
            if (releaseDeadline !== undefined) void releaseDeadline()
            if (releaseChild !== undefined) void releaseChild()
          }

          let finished: RunResult
          try {
            finished = adapter.finalize(state, outcome, {
              timedOut,
              timeoutSeconds,
              sessionId,
              aborted: exec.signal.aborted,
            })
          } catch (error) {
            // Classification is the adapter's last chance to speak; if it throws we
            // still owe the caller a settled run rather than a thrown tool.
            rawLog?.write('adapter.finalize_failed', { error: errorMessage(error) })
            finished = {
              ok: false,
              text: state.text,
              sessionId,
              errors: [`finalize failed: ${errorMessage(error)}`],
              extras: {},
            }
          }

          const errors = [...finished.errors]
          if (exec.signal.aborted && !finished.ok) errors.push('cancelled by caller')
          const ok = finished.ok && errors.length === 0
          rawLog?.write('adapter.finalized', {
            ok,
            text: finished.text,
            sessionId: finished.sessionId,
            errors,
            extras: finished.extras,
            timedOut,
            aborted: exec.signal.aborted,
          })

          if (ok && finished.sessionId !== null) lastSessions.set(harness, finished.sessionId)
          run.finish({
            ok,
            text: finished.text,
            sessionId: finished.sessionId,
            errors,
            extras: finished.extras,
          })

          /*
           * Read the digest back out of the store: `eventCount` counts MERGED
           * semantic events (delta folding consumes no `seq`), and the retained
           * events carry the `at` the store stamped, so each digest line gets the
           * moment the work actually happened rather than the batch's wall clock.
           * The run is finished, so nothing here can still change.
           */
          const detail = store.get(run.runId, 0)
          const steps = detail?.summary.eventCount ?? 0
          const timeline = (detail?.events ?? [])
            .slice(-RESULT_TIMELINE_EVENTS)
            .map(event => describeEvent(event, Math.round(event.at / 1000)))

          const stderrLines = stderrTail.trim()
          await rawLog?.close({
            ok,
            elapsedMs: Date.now() - startedAt,
            semanticEventCount: steps,
            captureError: rawLog.error ?? null,
          })
          return {
            ok,
            // The handle back to the full structured timeline the store retains.
            runId: run.runId,
            harness,
            label,
            mode,
            sessionId: finished.sessionId,
            cwd,
            elapsedMs: Date.now() - startedAt,
            costUsd: finished.extras.costUsd ?? null,
            numTurns: finished.extras.numTurns ?? null,
            steps,
            errors,
            stderrTail:
              errors.length > 0 && stderrLines.length > 0
                ? stderrLines.split('\n').slice(-STDERR_TAIL_LINES)
                : null,
            events: timeline,
            text: finished.text,
          }
        } catch (error) {
          // Settle the record, then answer in the failure shape: the caller gets a
          // reason instead of a thrown tool, and the store gets an evictable run
          // instead of one stuck at `running`.
          const message = `${harness} run failed: ${errorMessage(error)}`
          run.finish({ ok: false, text: '', sessionId: null, errors: [message], extras: {} })
          rawLog?.write('run.failed', { error: message, aborted: exec.signal.aborted })
          await rawLog?.close({ ok: false, elapsedMs: Date.now() - startedAt, captureError: rawLog.error ?? null })
          return { ok: false, runId: run.runId, harness, label, mode, cwd, errors: [message] }
        }
      } finally {
        const left = (inflight.get(harness) ?? 1) - 1
        if (left <= 0) inflight.delete(harness)
        else inflight.set(harness, left)
      }
    },
  })
}
