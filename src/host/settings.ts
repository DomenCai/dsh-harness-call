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
import { HARNESS_KEYS } from '../shared/harness.ts'
import {
  applyHarnessCallSettingsUpdate,
  isAccessSetting,
  isEffortSetting,
  normalizeHarnessCallSettings,
  type HarnessCallSettings,
  type HarnessCallSettingsUpdate,
} from '../shared/policy.ts'

/** The branded namespace name. */
export const HARNESS_CALL_NAMESPACE = settingsNamespace('harness-call')

const HarnessPolicySchema = z.object({
  access: z.union(['read-only', 'workspace-write', 'full-access', 'model'] as const).default('model'),
  effort: z.union(['low', 'medium', 'high', 'xhigh', 'model'] as const).default('model'),
})

/** Schemastery schema of the `harness-call` namespace section. */
export const HarnessCallSettingsSchema: z<HarnessCallSettings> = z.object({
  claude: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
  codex: HarnessPolicySchema.default({ access: 'model', effort: 'model' }),
  grok: HarnessPolicySchema.default({ access: 'model', effort: 'high' }),
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
  if (!(HARNESS_KEYS as readonly string[]).includes(update.harness)) {
    throw new Error(`dsh-harness-call: unknown harness ${String(update.harness)}`)
  }
  if (update.field === 'access' && !isAccessSetting(update.value)) {
    throw new Error(`dsh-harness-call: invalid access ${String(update.value)}`)
  }
  if (update.field === 'effort' && !isEffortSetting(update.value)) {
    throw new Error(`dsh-harness-call: invalid effort ${String(update.value)}`)
  }
  const next = applyHarnessCallSettingsUpdate(readHarnessCallSettings(scope), update)
  await scope.update({ [update.harness]: next[update.harness] })
  return readHarnessCallSettings(scope)
}
