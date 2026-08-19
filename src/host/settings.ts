/**
  * The `harness-call` settings namespace: per-harness access and effort
  * defaults managed from the Web settings page. Registered with the settings
  * provider at plugin load; the runtime reads the owner scope's live value on
  * every spawn, so changes take effect on the next call without a restart.
  *
  * @module dsh-harness-call/host/settings
  */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { HARNESS_KEYS } from '../shared/harness.js'
import {
  applyHarnessCallSettingsUpdate,
  HARNESS_EFFORT_OPTIONS,
  isAccessSetting,
  isEffortSetting,
  normalizeHarnessCallSettings,
  type HarnessCallSettings,
  type HarnessCallSettingsUpdate,
} from '../shared/policy.js'

/** The branded namespace name. */
export const HARNESS_CALL_NAMESPACE = settingsNamespace('harness-call')

const HarnessPolicySchema = z.object({
  access: z.union(['read-only', 'workspace-write', 'full-access', 'model'] as const).default('model'),
  effort: z.union(['low', 'medium', 'high', 'xhigh', 'max', 'model'] as const).default('model'),
})

const HarnessLogSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  directory: z.string().default('~/.dsh/harness-call/logs'),
})

/** Schemastery schema of the `harness-call` namespace section. */
export const HarnessCallSettingsSchema: z<HarnessCallSettings> = z.object({
  logs: HarnessLogSettingsSchema.default({ enabled: false, directory: '~/.dsh/harness-call/logs' }),
  claude: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
  codex: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
  grok: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
  kimi: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
})

/** Register the namespace and return its owner scope. */
export function registerHarnessCallSettings(ctx: Context): SettingsScope<HarnessCallSettings> {
  return ctx.settings.register(HARNESS_CALL_NAMESPACE, HarnessCallSettingsSchema, { applies: 'live' })
}

/** Live read of the resolved section. */
export function readHarnessCallSettings(scope: SettingsScope<HarnessCallSettings>): HarnessCallSettings {
  return normalizeHarnessCallSettings(scope.get())
}

/** Persist one field and return the resolved section. */
export async function writeHarnessCallSettings(
  scope: SettingsScope<HarnessCallSettings>,
  update: HarnessCallSettingsUpdate,
): Promise<HarnessCallSettings> {
  if (update.field === 'logs.enabled') {
    if (typeof update.value !== 'boolean') throw new Error('dsh-harness-call: logs.enabled must be boolean')
    const next = applyHarnessCallSettingsUpdate(readHarnessCallSettings(scope), update)
    await scope.update({ logs: next.logs })
    return readHarnessCallSettings(scope)
  }
  if (update.field === 'logs.directory') {
    const directory = update.value.trim()
    if (directory.length === 0) throw new Error('dsh-harness-call: log directory must not be empty')
    const next = applyHarnessCallSettingsUpdate(readHarnessCallSettings(scope), { ...update, value: directory })
    await scope.update({ logs: next.logs })
    return readHarnessCallSettings(scope)
  }
  if (!(HARNESS_KEYS as readonly string[]).includes(update.harness)) {
    throw new Error(`dsh-harness-call: unknown harness ${String(update.harness)}`)
  }
  if (update.field === 'access' && !isAccessSetting(update.value)) {
    throw new Error(`dsh-harness-call: invalid access ${String(update.value)}`)
  }
  if (update.field === 'effort') {
    if (!isEffortSetting(update.value)) {
      throw new Error(`dsh-harness-call: invalid effort ${String(update.value)}`)
    }
    // Per-harness vocabulary check: a level the CLI's API would reject (e.g.
    // kimi 400s on `medium` / `xhigh`) must not reach the store even when the
    // writer bypassed the settings page's restricted select.
    if (
      update.value !== 'model'
      && !(HARNESS_EFFORT_OPTIONS[update.harness] as readonly string[]).includes(update.value)
    ) {
      throw new Error(`dsh-harness-call: effort ${update.value} is not supported by ${update.harness}`)
    }
  }
  const next = applyHarnessCallSettingsUpdate(readHarnessCallSettings(scope), update)
  await scope.update({ [update.harness]: next[update.harness] })
  return readHarnessCallSettings(scope)
}
