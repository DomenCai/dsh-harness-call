/**
 * dsh-harness-call — host half.
 *
 * Registers the `harness_call` model tool, which delegates work to external
 * coding agent CLIs (Claude Code / Codex CLI / Grok CLI) through the adapter
 * registry, and exposes every run's live timeline to the browser half through
 * the `harnessCall` Typert Remote service.
 *
 * Installation (bundle): `dsh plugin --profile <name> add dsh-harness-call`.
 * The bundle patch mounts this plugin row into the host composition; the tool
 * joins the shared `tools` registry and the routing guidance joins the global
 * system prompt, so the plugin needs no realm of its own.
 *
 * @module dsh-harness-call
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "dsh-harness-call";
export declare const inject: string[];
/**
 * Plugin configuration.
 *
 * Every field is a retention bound. They are configuration rather than
 * constants because the right ceiling depends on the deployment: a long-lived
 * shared session wants tighter bounds than a short local one, and the cost of
 * getting it wrong is unbounded memory in the host process.
 */
export interface Config {
    /**
     * Events retained per run before the ring buffer evicts the oldest.
     * Evictions are counted into `droppedEvents`, never hidden.
     */
    maxEventsPerRun: number;
    /** Runs retained before the oldest finished one is discarded. */
    maxRuns: number;
    /** Characters of each prompt kept for the browser's preview line. */
    promptPreviewCharacters: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
