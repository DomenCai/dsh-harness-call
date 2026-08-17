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
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { RunStore } from './runs.ts';
/** Model-facing tool name; also the key the browser card renders against. */
export declare const TOOL_NAME = "harness_call";
/**
 * Routing guidance registered into the global system prompt.
 *
 * It teaches the model that `@claude` / `@codex` / `@grok` are intent markers,
 * not a forwarding syntax: the external agent sees nothing of this
 * conversation, so the model must compose a self-contained prompt rather than
 * pass the remainder of the message through.
 */
export declare const ROUTING_SECTION: string;
/**
 * Build the tool over a live context and run store.
 *
 * @param ctx - the plugin fiber's context; supplies `subprocess` and deadlines.
 * @param store - the run store this tool writes and the browser reads.
 * @returns a registry-ready tool definition.
 */
export declare function createHarnessCallTool(ctx: Context, store: RunStore): ToolDefinition;
