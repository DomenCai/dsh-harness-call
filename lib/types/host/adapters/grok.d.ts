/**
 * Grok CLI adapter: `grok -p <prompt> --output-format streaming-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. Unlike the other two harnesses the prompt is
 * an argument, not stdin, so this adapter spawns with no stdin at all.
 * Reasoning is pinned to `--reasoning-effort high` so a TUI `xhigh` default
 * cannot leak into delegated one-shot calls.
 *
 * @module dsh-harness-call/host/adapters/grok
 */
import type { HarnessAdapter, RunState } from '../adapter.ts';
/**
 * Grok streams the reply as `text` deltas and reasoning as per-token `thought`
 * deltas, and closes with one `end` frame carrying the session id, a stop
 * reason, and the cost/turn accounting; an `error` frame replaces it.
 * `finalize` checks the `end` frame's session id against the requested one —
 * a mismatch means the reply belongs to a different conversation.
 */
export interface GrokState extends RunState {
    /** The terminal `end` frame, once seen. */
    end?: Record<string, unknown>;
    /** The `error` frame, once seen; supersedes `end`. */
    error?: Record<string, unknown>;
    /**
     * `toolCallId` → tool name, so a `tool_call_update` (which carries no name
     * of its own) can be attributed to the tool the `tool_call` announced.
     */
    tools: Map<string, string>;
}
export declare const grokAdapter: HarnessAdapter<GrokState>;
