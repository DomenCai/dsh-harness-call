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

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Declaration merges only: make ctx.systemPrompt, ctx.tools, ctx.subprocess,
// and ctx.typert.register visible on the host Context.
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-settings'
import { PACKAGE_NAME } from './shared/wire.js'
import { HarnessCallRemoteService } from './host/remote.js'
import { RunStore } from './host/runs.js'
import {
  readHarnessCallSettings,
  registerHarnessCallSettings,
  writeHarnessCallSettings,
} from './host/settings.js'
import { createHarnessCallTool, ROUTING_SECTION } from './host/tool.js'
import { HARNESS_CALL_MANIFEST } from './host/wire.js'

export const name = PACKAGE_NAME
export const inject = ['subprocess', 'tools', 'systemPrompt', 'typert', 'settings']

/**
 * Plugin configuration.
 *
 * Every field is a retention bound. They are configuration rather than
 * constants because the right ceiling depends on the deployment: a long-lived
 * shared session wants tighter bounds than a short local one, and the cost of
 * getting it wrong is unbounded host memory or diagnostic disk usage.
 */
export interface Config {
  /**
   * Events retained per run before the ring buffer evicts the oldest.
   * Evictions are counted into `droppedEvents`, never hidden.
   */
  maxEventsPerRun: number
  /** Runs retained before the oldest finished one is discarded. */
  maxRuns: number
  /** Characters of each prompt kept for the browser's preview line. */
  promptPreviewCharacters: number
  /** Retained raw-log files, including captures currently being written. */
  rawLogFiles: number
  /** Ordinary-record byte budget per raw-log file; terminal markers are extra. */
  rawLogBytes: number
}

/*
 * Every bound is `.min(1)`, not merely natural. Zero is not a tighter budget,
 * it is a broken feature: `maxEventsPerRun: 0` makes the ring buffer evict
 * every event on the append that created it, so no timeline ever exists;
 * `maxRuns: 0` deletes each run the instant it finishes, so the browser can
 * never poll a settled card; `promptPreviewCharacters: 0` leaves a card with
 * nothing but an ellipsis; zero raw-log files or bytes cannot hold the required
 * header. A configuration that silently disables a feature is rejected.
 */
export const Config: z<Config> = z.object({
  maxEventsPerRun: z.natural().min(1).default(400).description('Events retained per run before the ring buffer evicts.'),
  maxRuns: z.natural().min(1).default(50).description('Runs retained before the oldest finished one is discarded.'),
  promptPreviewCharacters: z.natural().min(1).default(280).description('Characters of each prompt kept for the browser preview.'),
  rawLogFiles: z.natural().min(1).default(200).description('Raw log files retained, including active captures.'),
  rawLogBytes: z.natural().min(1).default(33_554_432).description('Ordinary-record bytes allowed per raw log file.'),
})

export function apply(ctx: Context, config: Config): void {
  const store = new RunStore({
    maxEventsPerRun: config.maxEventsPerRun,
    maxRuns: config.maxRuns,
    promptPreviewCharacters: config.promptPreviewCharacters,
  })
  const settings = registerHarnessCallSettings(ctx)
  const readSettings = () => readHarnessCallSettings(settings)
  const writeSettings = (update: Parameters<typeof writeHarnessCallSettings>[1]) =>
    writeHarnessCallSettings(settings, update)

  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'tool:harness-call', order: 116, text: ROUTING_SECTION }),
    `${PACKAGE_NAME}: routing section`,
  )

  // The service registers itself on construction and unregisters with the fiber.
  new HarnessCallRemoteService(ctx, store, readSettings, writeSettings)

  ctx.effect(() => {
    const dispose = ctx.typert.register(HARNESS_CALL_MANIFEST)
    return () => { void dispose() }
  }, `${PACKAGE_NAME}: typert manifest`)

  ctx.effect(
    () => ctx.tools.register(createHarnessCallTool(ctx, store, readSettings, {
      files: config.rawLogFiles,
      bytes: config.rawLogBytes,
    })),
    `${PACKAGE_NAME}: harness_call tool`,
  )
}
