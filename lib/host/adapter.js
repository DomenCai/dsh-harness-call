/**
 * The adapter contract: everything that differs between external harnesses.
 *
 * One adapter owns exactly one CLI. It knows how to spell a run as argv/stdin/
 * env, how to fold that CLI's native JSONL vocabulary into normalized
 * {@link HarnessEvent}s, and how to classify the finished process. It knows
 * nothing about ring buffers, sequence numbers, timers, the tool schema, or
 * the browser — the orchestrator in ./runs.ts owns all of that, so adding a
 * harness is one file plus one roster entry.
 *
 * @module dsh-harness-call/host/adapter
 */
export {};
