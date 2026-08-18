/**
  * Launch policy shared by the host adapters, the model tool, and the
  * settings page. Zero runtime dependencies — see the note in ./events.ts.
  *
  * @module dsh-harness-call/shared/policy
  */

import { HARNESS_KEYS, type HarnessKey } from './harness.ts'

/** Concrete filesystem / approval posture passed to a CLI. */
export const ACCESS_MODES = ['read-only', 'workspace-write', 'full-access'] as const

/** {@link ACCESS_MODES} plus the "let this call decide" sentinel. */
export const ACCESS_SETTINGS = [...ACCESS_MODES, 'model'] as const

/** Concrete reasoning effort passed to a CLI. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const

/** {@link EFFORT_LEVELS} plus the "let this call decide" sentinel. */
export const EFFORT_SETTINGS = [...EFFORT_LEVELS, 'model'] as const

/** One concrete access mode. */
export type AccessMode = (typeof ACCESS_MODES)[number]

/** Access mode or `model` (the tool argument, if any, wins). */
export type AccessSetting = (typeof ACCESS_SETTINGS)[number]

/** One concrete effort level. */
export type EffortLevel = (typeof EFFORT_LEVELS)[number]

/** Effort level or `model` (the tool argument, if any, wins). */
export type EffortSetting = (typeof EFFORT_SETTINGS)[number]

/** Per-harness launch knobs the settings page edits. */
export interface HarnessPolicy {
  readonly access: AccessSetting
  readonly effort: EffortSetting
}

/** Durable settings section for every rostered harness. */
export type HarnessCallSettings = { readonly [K in HarnessKey]: HarnessPolicy }

/** One field write from the settings page. */
export type HarnessCallSettingsUpdate =
  | { readonly harness: HarnessKey, readonly field: 'access', readonly value: AccessSetting }
  | { readonly harness: HarnessKey, readonly field: 'effort', readonly value: EffortSetting }

/** Fresh defaults: leave Claude/Codex to the call; pin Grok effort so TUI `xhigh` cannot leak. */
export function defaultHarnessCallSettings(): HarnessCallSettings {
  return {
    claude: { access: 'model', effort: 'model' },
    codex: { access: 'model', effort: 'model' },
    grok: { access: 'model', effort: 'high' },
  }
}

/** Whether an untrusted value is a concrete access mode. */
export function isAccessMode(value: unknown): value is AccessMode {
  return typeof value === 'string' && (ACCESS_MODES as readonly string[]).includes(value)
}

/** Whether an untrusted value is an access setting (including `model`). */
export function isAccessSetting(value: unknown): value is AccessSetting {
  return typeof value === 'string' && (ACCESS_SETTINGS as readonly string[]).includes(value)
}

/** Whether an untrusted value is a concrete effort level. */
export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value)
}

/** Whether an untrusted value is an effort setting (including `model`). */
export function isEffortSetting(value: unknown): value is EffortSetting {
  return typeof value === 'string' && (EFFORT_SETTINGS as readonly string[]).includes(value)
}

/**
  * Fill any missing harness / field from {@link defaultHarnessCallSettings}.
  * A partial stored section (or a missing settings provider) must still be
  * something `adapter.build` can read without optional chaining on every key.
  */
export function normalizeHarnessCallSettings(value: unknown): HarnessCallSettings {
  const defaults = defaultHarnessCallSettings()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return defaults
  const source = value as Record<string, unknown>
  const next = { ...defaults }
  for (const key of HARNESS_KEYS) {
    const row = source[key]
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const policy = row as Record<string, unknown>
    next[key] = {
      access: isAccessSetting(policy['access']) ? policy['access'] : defaults[key].access,
      effort: isEffortSetting(policy['effort']) ? policy['effort'] : defaults[key].effort,
    }
  }
  return next
}

/** Apply one settings-page write onto a normalized section. */
export function applyHarnessCallSettingsUpdate(
  current: HarnessCallSettings,
  update: HarnessCallSettingsUpdate,
): HarnessCallSettings {
  return {
    ...current,
    [update.harness]: {
      ...current[update.harness],
      [update.field]: update.value,
    },
  }
}

/**
  * Resolve one setting against an optional per-call override.
  *
  * A concrete setting always wins. `model` defers to the tool argument, then
  * to `fallback` (used for Codex access = read-only and Grok effort = high).
  */
export function resolveChoice<T>(setting: T | 'model', override: T | undefined, fallback?: T): T | undefined {
  if (setting !== 'model') return setting
  return override ?? fallback
}

/** The concrete knobs one spawn should apply, after settings + tool args. */
export interface ResolvedRunPolicy {
  readonly access: AccessMode | undefined
  readonly effort: EffortLevel | undefined
}

/** Fold the durable section and this call's optional overrides into argv knobs. */
export function resolveRunPolicy(
  settings: HarnessCallSettings,
  harness: HarnessKey,
  overrides: { readonly access?: AccessMode, readonly effort?: EffortLevel },
): ResolvedRunPolicy {
  const policy = settings[harness]
  return {
    access: resolveChoice(
      policy.access,
      overrides.access,
      harness === 'codex' ? 'read-only' : undefined,
    ),
    effort: resolveChoice(
      policy.effort,
      overrides.effort,
      harness === 'grok' ? 'high' : undefined,
    ),
  }
}
