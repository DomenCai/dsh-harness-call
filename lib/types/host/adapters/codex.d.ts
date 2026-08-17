/**
 * Codex CLI adapter: `codex exec --json`.
 *
 * Session handling: Codex names the session itself and announces it in
 * `thread.started`, so a new run cannot be given an id; `exec resume <id>`
 * continues one. A resumed run also keeps the sandbox and writable roots it
 * was created with, which is why `--sandbox` is a new-session-only flag.
 *
 * @module dsh-harness-call/host/adapters/codex
 */
import type { HarnessAdapter, RunState } from '../adapter.ts';
/**
 * Codex signals success structurally rather than in one payload: the thread id
 * arrives in `thread.started`, the reply in an `agent_message` item, and the
 * verdict in `turn.completed` / `turn.failed`. All four are tracked because a
 * run missing any of them is not a success.
 */
export interface CodexState extends RunState {
    /** Thread id from `thread.started`; Codex's session identity. */
    sessionId?: string;
    /** A `turn.completed` event was seen. */
    completed?: boolean;
    /** The `turn.failed` event, once seen. */
    failed?: Record<string, unknown>;
}
export declare const codexAdapter: HarnessAdapter<CodexState>;
