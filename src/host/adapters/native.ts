/**
 * Readers for untrusted harness output, shared by the three adapters.
 *
 * Every `translate` is handed `unknown`: one line of another process's stdout,
 * parsed as JSON and validated by nobody. These readers are the only place
 * that faces that fact — an adapter asks for a field and gets it or gets
 * `undefined`, so no adapter needs a cast, and none of them can accidentally
 * assume a shape the CLI never promised.
 *
 * @module dsh-harness-call/host/adapters/native
 */

import type { Outcome } from '../adapter.ts'

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
