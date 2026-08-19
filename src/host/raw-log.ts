/**
 * Opt-in lossless diagnostic capture for one external harness run.
 *
 * This module deliberately does not participate in the normalized event model
 * or browser Remote. It records what the host actually received, plus the
 * adapter's interpretation, into one append-only NDJSON file so later display
 * changes can be based on real transcripts.
 *
 * @module dsh-harness-call/host/raw-log
 */

import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { finished } from 'node:stream/promises'

/** Metadata known before the child process is built or spawned. */
export interface RawLogStart {
  readonly directory: string
  readonly cwd: string
  readonly runId: string
  readonly callId: string
  readonly harness: string
  readonly label: string
  readonly mode: string
  readonly sessionId: string
  readonly prompt: string
  readonly access: string | undefined
  readonly effort: string | undefined
  readonly timeoutSeconds: number
  readonly startedAt: number
}

/** Result of trying to open a capture without making capture failure abort the run. */
export interface RawLogOpenResult {
  readonly capture?: RawRunLog
  readonly error?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** File-system-safe UTC timestamp that remains lexically sortable. */
function fileTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/[:.]/g, '-')
}

/** Expand `~` and make relative user settings relative to the call's cwd. */
export function resolveRawLogDirectory(configured: string, cwd: string): string {
  const value = configured.trim()
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value)
}

/** Credential-shaped explicit environment keys whose values must not be persisted. */
const SENSITIVE_ENV_PATTERN = /(token|key|secret|password|passwd|auth|credential|cookie)/i

/** Replace a repeated prompt argument with a stable reference to run.start.prompt. */
export function captureArgv(argv: readonly string[], prompt: string): unknown[] {
  return argv.map(value => value === prompt ? { ref: 'run.start.prompt' } : value)
}

/** Capture adapter env without writing obvious explicit credentials to disk. */
export function captureEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string | null> {
  const captured: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(env)) {
    captured[key] = SENSITIVE_ENV_PATTERN.test(key) ? '[REDACTED]' : value ?? null
  }
  return captured
}

/**
 * One append-only run log.
 *
 * `write()` calls are serialized by Node's WriteStream in invocation order. The
 * resulting `seq` is therefore the order in which this host observed callbacks,
 * not a claim about the operating system's original cross-fd write order.
 */
export class RawRunLog {
  readonly path: string
  private readonly stream: WriteStream
  private readonly startedAt: number
  private sequence = 0
  private closed = false
  private issue: string | undefined

  constructor(path: string, stream: WriteStream, startedAt: number) {
    this.path = path
    this.stream = stream
    this.startedAt = startedAt
    stream.on('error', (error) => {
      this.issue ??= errorMessage(error)
    })
  }

  /** The first asynchronous write/close failure, when one occurred. */
  get error(): string | undefined {
    return this.issue
  }

  /** Append one owned JSON record and return its source-linkable sequence id. */
  write(type: string, fields: Readonly<Record<string, unknown>> = {}): number | undefined {
    if (this.closed || this.issue !== undefined) return undefined
    this.sequence += 1
    const seq = this.sequence
    const record = {
      seq,
      atMs: Date.now() - this.startedAt,
      time: new Date().toISOString(),
      type,
      ...fields,
    }
    try {
      this.stream.write(`${JSON.stringify(record)}\n`)
      return seq
    } catch (error) {
      this.issue ??= errorMessage(error)
      return undefined
    }
  }

  /** Write the terminal marker, flush queued bytes, and close the descriptor. */
  async close(fields: Readonly<Record<string, unknown>> = {}): Promise<void> {
    if (this.closed) return
    this.write('capture.end', fields)
    this.closed = true
    try {
      this.stream.end()
      await finished(this.stream)
    } catch (error) {
      this.issue ??= errorMessage(error)
    }
  }
}

/**
 * Open a mode-0600 NDJSON file and write its run-start record.
 *
 * A capture error is returned rather than thrown: observability must not turn a
 * healthy delegated run into a failed tool call.
 */
export async function openRawRunLog(start: RawLogStart): Promise<RawLogOpenResult> {
  const directory = resolveRawLogDirectory(start.directory, start.cwd)
  const suffix = randomUUID().slice(0, 8)
  const filename = `${fileTimestamp(start.startedAt)}-${start.harness}-${start.runId}-${suffix}.ndjson`
  const path = join(directory, filename)

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stream = createWriteStream(path, {
      encoding: 'utf8',
      flags: 'wx',
      mode: 0o600,
    })
    await once(stream, 'open')
    const capture = new RawRunLog(path, stream, start.startedAt)
    capture.write('run.start', {
      runId: start.runId,
      callId: start.callId,
      harness: start.harness,
      label: start.label,
      mode: start.mode,
      requestedSessionId: start.sessionId,
      cwd: start.cwd,
      prompt: start.prompt,
      access: start.access ?? null,
      effort: start.effort ?? null,
      timeoutSeconds: start.timeoutSeconds,
      hostPid: process.pid,
    })
    return { capture }
  } catch (error) {
    return { error: `raw log open failed for ${path}: ${errorMessage(error)}` }
  }
}
