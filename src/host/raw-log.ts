/** Opt-in bounded diagnostic capture for one external harness run. */

import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { finished } from 'node:stream/promises'

/**
 * Raw-log record format version written into every run.start record.
 *
 * Bump this ONLY when an already-written record changes shape incompatibly — a
 * field renamed or given a new meaning, or a `type` value whose semantics move.
 * Adding a new `type`, or a new optional field, does NOT bump it: a reader can
 * ignore what it does not recognize. Readers must reject an unknown higher
 * version outright rather than parsing it best-effort.
 */
export const RAW_LOG_VERSION = 1

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
  readonly rawLogFiles: number
  readonly rawLogBytes: number
}

export interface RawLogOpenResult {
  readonly capture?: RawRunLog
  readonly error?: string
}

const activePaths = new Set<string>()
let openQueue: Promise<void> = Promise.resolve()

async function withOpenLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = openQueue
  let release: (() => void) | undefined
  openQueue = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    return await task()
  } finally {
    release?.()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fileTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/[:.]/g, '-')
}

export function resolveRawLogDirectory(configured: string, cwd: string): string {
  const value = configured.trim()
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value)
}

const SENSITIVE_ENV_PATTERN = /(token|key|secret|password|passwd|auth|credential|cookie)/i

export function captureArgv(argv: readonly string[], prompt: string): unknown[] {
  return argv.map(value => value === prompt ? { ref: 'run.start.prompt' } : value)
}

/** null is an env tombstone; [REDACTED] means a value existed but was hidden. */
export function captureEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string | null> {
  const captured: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(env)) {
    captured[key] = value === undefined
      ? null
      : SENSITIVE_ENV_PATTERN.test(key) ? '[REDACTED]' : value
  }
  return captured
}

function boundedTerminalFields(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const bounded: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') bounded[key] = value
    else if (typeof value === 'string') bounded[key] = value.slice(0, 512)
    else if (value !== undefined) bounded[key] = String(value).slice(0, 512)
  }
  return bounded
}

export class RawRunLog {
  readonly path: string
  private readonly stream: WriteStream
  private readonly startedAt: number
  private readonly byteBudget: number
  private sequence = 0
  private bytesWritten = 0
  private truncated = false
  private droppedRecords = 0
  private closed = false
  private issue: string | undefined

  constructor(path: string, stream: WriteStream, startedAt: number, byteBudget: number) {
    this.path = path
    this.stream = stream
    this.startedAt = startedAt
    this.byteBudget = byteBudget
    stream.on('error', error => { this.issue ??= errorMessage(error) })
  }

  get error(): string | undefined {
    return this.issue
  }

  /** Append one ordinary record within the configured byte budget. */
  write(type: string, fields: Readonly<Record<string, unknown>> = {}): number | undefined {
    if (this.closed || this.issue !== undefined) return undefined
    if (this.truncated) {
      this.droppedRecords += 1
      return undefined
    }
    const seq = this.sequence + 1
    const line = this.line(seq, type, fields)
    const bytes = Buffer.byteLength(line, 'utf8')
    if (this.bytesWritten + bytes > this.byteBudget) {
      this.truncated = true
      this.droppedRecords += 1
      return undefined
    }
    try {
      this.stream.write(line)
      this.sequence = seq
      this.bytesWritten += bytes
      return seq
    } catch (error) {
      this.issue ??= errorMessage(error)
      return undefined
    }
  }

  /** Write bounded terminal records outside the ordinary record budget. */
  async close(fields: Readonly<Record<string, unknown>> = {}): Promise<void> {
    if (this.closed) return
    try {
      if (this.truncated) {
        this.writeTerminal('capture.truncated', {
          droppedRecords: this.droppedRecords,
          byteBudget: this.byteBudget,
        })
      }
      this.writeTerminal('capture.end', boundedTerminalFields(fields))
    } finally {
      this.closed = true
      try {
        this.stream.end()
        await finished(this.stream)
      } catch (error) {
        this.issue ??= errorMessage(error)
      } finally {
        activePaths.delete(this.path)
      }
    }
  }

  /** Abandon a capture whose mandatory run.start record did not fit. */
  async discard(): Promise<void> {
    if (!this.closed) {
      this.closed = true
      try {
        this.stream.end()
        await finished(this.stream)
      } catch (error) {
        this.issue ??= errorMessage(error)
      } finally {
        activePaths.delete(this.path)
      }
    }
    try {
      await unlink(this.path)
    } catch (error) {
      this.issue ??= errorMessage(error)
    }
  }

  private line(seq: number, type: string, fields: Readonly<Record<string, unknown>>): string {
    return JSON.stringify({
      seq,
      atMs: Date.now() - this.startedAt,
      time: new Date().toISOString(),
      type,
      ...fields,
    }) + '\n'
  }

  private writeTerminal(type: string, fields: Readonly<Record<string, unknown>>): void {
    const seq = this.sequence + 1
    try {
      this.stream.write(this.line(seq, type, fields))
      this.sequence = seq
    } catch (error) {
      this.issue ??= errorMessage(error)
    }
  }
}

async function reserveCaptureSlot(directory: string, maxFiles: number): Promise<string | undefined> {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.ndjson'))
    .map(entry => entry.name)
    .sort()
  while (names.length > maxFiles - 1) {
    const index = names.findIndex(name => !activePaths.has(join(directory, name)))
    if (index < 0) return 'raw log file limit reached; every retained capture is active'
    const name = names[index]
    if (name === undefined) break
    await unlink(join(directory, name))
    names.splice(index, 1)
  }
  return undefined
}

/** Open a mode-0600 NDJSON capture without ever failing the delegated run. */
export async function openRawRunLog(start: RawLogStart): Promise<RawLogOpenResult> {
  const directory = resolveRawLogDirectory(start.directory, start.cwd)
  const suffix = randomUUID().slice(0, 8)
  const filename = fileTimestamp(start.startedAt) + '-' + start.harness + '-' + start.runId + '-' + suffix + '.ndjson'
  const path = join(directory, filename)

  return withOpenLock(async () => {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const capacityError = await reserveCaptureSlot(directory, start.rawLogFiles)
      if (capacityError !== undefined) return { error: capacityError }
      const stream = createWriteStream(path, {
        encoding: 'utf8',
        flags: 'wx',
        mode: 0o600,
      })
      await once(stream, 'open')
      activePaths.add(path)
      const capture = new RawRunLog(path, stream, start.startedAt, start.rawLogBytes)
      const startSeq = capture.write('run.start', {
        captureVersion: RAW_LOG_VERSION,
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
      if (startSeq === undefined) {
        await capture.discard()
        return { error: 'raw log run.start exceeds byte budget ' + start.rawLogBytes }
      }
      return { capture }
    } catch (error) {
      activePaths.delete(path)
      try { await unlink(path) } catch { /* the file may never have been created */ }
      return { error: 'raw log open failed for ' + path + ': ' + errorMessage(error) }
    }
  })
}
