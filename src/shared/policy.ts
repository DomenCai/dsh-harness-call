/**
  * Launch policy shared by the host adapters, the model tool, and the
  * settings page. Zero runtime dependencies — see the note in ./events.ts.
  *
  * @module dsh-harness-call/shared/policy
  */

import { HARNESS_KEYS, type HarnessKey } from './harness.js'

/** Concrete filesystem / approval posture passed to a CLI. */
export const ACCESS_MODES = ['read-only', 'workspace-write', 'full-access'] as const

/** {@link ACCESS_MODES} plus the "let this call decide" sentinel. */
export const ACCESS_SETTINGS = [...ACCESS_MODES, 'model'] as const

/**
 * Concrete reasoning effort passed to a CLI: the UNION of every level any
 * rostered harness understands. No single CLI takes all of them — kimi's
 * vocabulary is `low / high / max` while the others spell the tiers
 * `low / medium / high / xhigh` — so the settings page and the settings write
 * path restrict choices per harness via {@link HARNESS_EFFORT_OPTIONS}. This
 * list is the tool parameter's enum and the persistence union, nothing more.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

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

/** Default directory for opt-in raw harness transcripts. `~` is host-expanded. */
export const DEFAULT_LOG_DIRECTORY = '~/.dsh/harness-call/logs'

/** Opt-in diagnostic capture shared by every harness. */
export interface HarnessLogSettings {
  readonly enabled: boolean
  readonly directory: string
}

/** Durable settings section: global logging plus every rostered harness policy. */
export type HarnessCallSettings = {
  readonly logs: HarnessLogSettings
} & { readonly [K in HarnessKey]: HarnessPolicy }

/** One field write from the settings page. */
export type HarnessCallSettingsUpdate =
  | { readonly harness: HarnessKey, readonly field: 'access', readonly value: AccessSetting }
  | { readonly harness: HarnessKey, readonly field: 'effort', readonly value: EffortSetting }
  | { readonly field: 'logs.enabled', readonly value: boolean }
  | { readonly field: 'logs.directory', readonly value: string }

/** Fresh defaults: launch knobs defer to calls and raw capture is off. */
export function defaultHarnessCallSettings(): HarnessCallSettings {
  return {
    logs: { enabled: false, directory: DEFAULT_LOG_DIRECTORY },
    claude: { access: 'model', effort: 'model' },
    codex: { access: 'model', effort: 'model' },
    grok: { access: 'model', effort: 'model' },
    kimi: { access: 'model', effort: 'model' },
  }
}

/**
 * Which launch knobs each harness can actually honor.
 *
 * Total over {@link HarnessKey}, so a new roster entry cannot compile without
 * a verdict here. `false` means the CLI has no headless flag for the knob:
 * the settings page disables that select rather than letting a choice pretend
 * to work, and the adapter documents why it never reads the value.
 */
export interface HarnessCapabilities {
  readonly access: boolean
  readonly effort: boolean
}

/** Capability table; the settings page reads it to grey out unsupported fields. */
export const HARNESS_CAPABILITIES: Readonly<Record<HarnessKey, HarnessCapabilities>> = {
  claude: { access: true, effort: true },
  codex: { access: true, effort: true },
  grok: { access: true, effort: true },
  // kimi-code's prompt mode rejects every permission flag (--yolo / --auto /
  // --plan cannot combine with -p, and --permission is not a CLI option), so
  // access is honored by nobody. Effort maps to KIMI_MODEL_THINKING_EFFORT.
  kimi: { access: false, effort: true },
}

/**
 * The concrete effort levels each harness actually accepts, in menu order.
 *
 * Total over {@link HarnessKey}. kimi's API 400s on `medium` / `xhigh`; the
 * settings select offers exactly these levels and `writeHarnessCallSettings`
 * rejects anything outside them, so a level the CLI cannot take is never saved.
 */
export const HARNESS_EFFORT_OPTIONS: Readonly<Record<HarnessKey, readonly EffortLevel[]>> = {
  claude: ['low', 'medium', 'high', 'xhigh'],
  codex: ['low', 'medium', 'high', 'xhigh'],
  grok: ['low', 'medium', 'high', 'xhigh'],
  kimi: ['low', 'high', 'max'],
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
  const logs = source['logs']
  if (logs !== null && typeof logs === 'object' && !Array.isArray(logs)) {
    const raw = logs as Record<string, unknown>
    next.logs = {
      enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : defaults.logs.enabled,
      directory:
        typeof raw['directory'] === 'string' && raw['directory'].trim().length > 0
          ? raw['directory'].trim()
          : defaults.logs.directory,
    }
  }
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
  if (update.field === 'logs.enabled') {
    return { ...current, logs: { ...current.logs, enabled: update.value } }
  }
  if (update.field === 'logs.directory') {
    return { ...current, logs: { ...current.logs, directory: update.value } }
  }
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
  * to `fallback` (used for Codex access = read-only).
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
    // No effort fallback for any harness: when Settings and the tool both stay
    // silent, the CLI's own config default applies — pinning a level here would
    // override a preference the user set in that CLI's own config file.
    effort: resolveChoice(policy.effort, overrides.effort),
  }
}
