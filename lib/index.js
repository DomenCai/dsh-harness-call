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
import z from '@deepseek-ai/schemastery';
import { PACKAGE_NAME } from "./shared/wire.js";
import { HarnessCallRemoteService } from "./host/remote.js";
import { RunStore } from "./host/runs.js";
import { readHarnessCallSettings, registerHarnessCallSettings, writeHarnessCallSettings, } from "./host/settings.js";
import { createHarnessCallTool, ROUTING_SECTION } from "./host/tool.js";
import { HARNESS_CALL_MANIFEST } from "./host/wire.js";
export const name = PACKAGE_NAME;
export const inject = ['subprocess', 'tools', 'systemPrompt', 'typert', 'settings'];
/*
 * Every bound is `.min(1)`, not merely natural. Zero is not a tighter budget,
 * it is a broken feature: `maxEventsPerRun: 0` makes the ring buffer evict
 * every event on the append that created it, so no timeline ever exists;
 * `maxRuns: 0` deletes each run the instant it finishes, so the browser can
 * never poll a settled card; `promptPreviewCharacters: 0` leaves a card with
 * nothing but an ellipsis. A configuration that can only silently disable the
 * plugin is a misconfiguration, so the schema rejects it instead.
 */
export const Config = z.object({
    maxEventsPerRun: z.natural().min(1).default(400).description('Events retained per run before the ring buffer evicts.'),
    maxRuns: z.natural().min(1).default(50).description('Runs retained before the oldest finished one is discarded.'),
    promptPreviewCharacters: z.natural().min(1).default(280).description('Characters of each prompt kept for the browser preview.'),
});
export function apply(ctx, config) {
    const store = new RunStore({
        maxEventsPerRun: config.maxEventsPerRun,
        maxRuns: config.maxRuns,
        promptPreviewCharacters: config.promptPreviewCharacters,
    });
    const settings = registerHarnessCallSettings(ctx);
    const readSettings = () => readHarnessCallSettings(settings);
    const writeSettings = (update) => writeHarnessCallSettings(settings, update);
    ctx.effect(() => ctx.systemPrompt.section({ name: 'tool:harness-call', order: 116, text: ROUTING_SECTION }), `${PACKAGE_NAME}: routing section`);
    // The service registers itself on construction and unregisters with the fiber.
    new HarnessCallRemoteService(ctx, store, readSettings, writeSettings);
    ctx.effect(() => {
        const dispose = ctx.typert.register(HARNESS_CALL_MANIFEST);
        return () => { void dispose(); };
    }, `${PACKAGE_NAME}: typert manifest`);
    ctx.effect(() => ctx.tools.register(createHarnessCallTool(ctx, store, readSettings)), `${PACKAGE_NAME}: harness_call tool`);
}
