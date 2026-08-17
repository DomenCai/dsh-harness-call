/**
 * Claude Code adapter: `claude --print --verbose --output-format stream-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. The prompt goes over stdin.
 *
 * @module dsh-harness-call/host/adapters/claude
 */
import type { HarnessAdapter, RunState } from '../adapter.ts';
/**
 * Claude reports the run's verdict in one terminal `result` event carrying the
 * final text, the session id, and the cost/turn accounting; the streamed
 * assistant blocks are only progress. `finalize` therefore treats a missing
 * `result` as a failure rather than trusting the accumulated text.
 */
export interface ClaudeState extends RunState {
    /** The terminal `type: "result"` event, once seen. */
    result?: Record<string, unknown>;
}
export declare const claudeAdapter: HarnessAdapter<ClaudeState>;
