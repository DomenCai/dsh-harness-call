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
import type { Outcome } from '../adapter.ts';
/**
 * Whether a value is a keyed object worth reading fields from. Arrays are
 * excluded: a JSONL frame is never one, and treating it as one would let
 * numeric-index lookups masquerade as fields.
 */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** `source[key]` when `source` is a record and the field is a string. */
export declare function readString(source: unknown, key: string): string | undefined;
/** `source[key]` when `source` is a record and the field is a number. */
export declare function readNumber(source: unknown, key: string): number | undefined;
/** `source[key]` when `source` is a record and the field is one too. */
export declare function readRecord(source: unknown, key: string): Record<string, unknown> | undefined;
/**
 * Describe a non-zero exit, or `undefined` when the child exited cleanly.
 *
 * `exitCode` is `null` when the process died from a signal instead of
 * returning — never a success, which is why the test is `!== 0` rather than a
 * positive-code check, and why the signal is appended when there is one.
 */
export declare function exitFailure(harness: string, outcome: Outcome): string | undefined;
