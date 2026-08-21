/**
 * Readers for untrusted harness output, shared by the adapters.
 *
 * Every `translate` is handed `unknown`: one line of another process's stdout,
 * parsed as JSON and validated by nobody. These readers are the only place
 * that faces that fact — an adapter asks for a field and gets it or gets
 * `undefined`, so no adapter needs a cast, and none of them can accidentally
 * assume a shape the CLI never promised.
 *
 * @module dsh-harness-call/host/adapters/native
 */

import type { HarnessEvent } from '../../shared/events.js'
import type { Outcome } from '../adapter.js'

/**
 * Whether a value is a keyed object worth reading fields from. Arrays are
 * excluded: a JSONL frame is never one, and treating it as one would let
 * numeric-index lookups masquerade as fields.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `source[key]` when `source` is a record and the field is a string. */
export function readString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) return undefined
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

/** `source[key]` when `source` is a record and the field is a number. */
export function readNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) return undefined
  const value = source[key]
  return typeof value === 'number' ? value : undefined
}

/** `source[key]` when `source` is a record and the field is one too. */
export function readRecord(source: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(source)) return undefined
  const value = source[key]
  return isRecord(value) ? value : undefined
}

/** Whether a sparse normalized object contains at least one defined field. */
export function hasDefined(value: Record<string, unknown>): boolean {
  return Object.values(value).some(entry => entry !== undefined)
}

/**
 * Flatten untrusted tool output onto a string the store can cap.
 *
 * Adapters must not truncate: this only chooses a representation. A string
 * is kept as-is; nested JSON is stringified; anything else falls back to
 * `String`. `undefined` means there was nothing to show.
 */
export function toolOutputText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text
  } catch {
    return String(value)
  }
}

/**
 * Drop a start/finish that has no harness-native call id.
 *
 * Synthesizing an id would send the client projection down its orphan path
 * with a key that never matches anything. A note still marks the work.
 */
export function missingCallId(label: string): HarnessEvent {
  return { kind: 'note', text: label }
}

/**
 * Describe a non-zero exit, or `undefined` when the child exited cleanly.
 *
 * `exitCode` is `null` when the process died from a signal instead of
 * returning — never a success, which is why the test is `!== 0` rather than a
 * positive-code check, and why the signal is appended when there is one.
 */
export function exitFailure(harness: string, outcome: Outcome): string | undefined {
  if (outcome.exitCode === 0) return undefined
  const signal = outcome.signal === null ? '' : ` ${outcome.signal}`
  return `${harness} exited with code ${String(outcome.exitCode)}${signal}`
}
