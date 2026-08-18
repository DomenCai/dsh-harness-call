/**
  * Launch policy shared by the host adapters, the model tool, and the
  * settings page. Zero runtime dependencies — see the note in ./events.ts.
  *
  * @module dsh-harness-call/shared/policy
  */
import { HARNESS_KEYS } from "./harness.js";
/** Concrete filesystem / approval posture passed to a CLI. */
export const ACCESS_MODES = ['read-only', 'workspace-write', 'full-access'];
/** {@link ACCESS_MODES} plus the "let this call decide" sentinel. */
export const ACCESS_SETTINGS = [...ACCESS_MODES, 'model'];
/** Concrete reasoning effort passed to a CLI. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'];
/** {@link EFFORT_LEVELS} plus the "let this call decide" sentinel. */
export const EFFORT_SETTINGS = [...EFFORT_LEVELS, 'model'];
/** Fresh defaults: leave Claude/Codex to the call; pin Grok effort so TUI `xhigh` cannot leak. */
export function defaultHarnessCallSettings() {
    return {
        claude: { access: 'model', effort: 'model' },
        codex: { access: 'model', effort: 'model' },
        grok: { access: 'model', effort: 'high' },
    };
}
/** Whether an untrusted value is a concrete access mode. */
export function isAccessMode(value) {
    return typeof value === 'string' && ACCESS_MODES.includes(value);
}
/** Whether an untrusted value is an access setting (including `model`). */
export function isAccessSetting(value) {
    return typeof value === 'string' && ACCESS_SETTINGS.includes(value);
}
/** Whether an untrusted value is a concrete effort level. */
export function isEffortLevel(value) {
    return typeof value === 'string' && EFFORT_LEVELS.includes(value);
}
/** Whether an untrusted value is an effort setting (including `model`). */
export function isEffortSetting(value) {
    return typeof value === 'string' && EFFORT_SETTINGS.includes(value);
}
/**
  * Fill any missing harness / field from {@link defaultHarnessCallSettings}.
  * A partial stored section (or a missing settings provider) must still be
  * something `adapter.build` can read without optional chaining on every key.
  */
export function normalizeHarnessCallSettings(value) {
    const defaults = defaultHarnessCallSettings();
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return defaults;
    const source = value;
    const next = { ...defaults };
    for (const key of HARNESS_KEYS) {
        const row = source[key];
        if (row === null || typeof row !== 'object' || Array.isArray(row))
            continue;
        const policy = row;
        next[key] = {
            access: isAccessSetting(policy['access']) ? policy['access'] : defaults[key].access,
            effort: isEffortSetting(policy['effort']) ? policy['effort'] : defaults[key].effort,
        };
    }
    return next;
}
/** Apply one settings-page write onto a normalized section. */
export function applyHarnessCallSettingsUpdate(current, update) {
    return {
        ...current,
        [update.harness]: {
            ...current[update.harness],
            [update.field]: update.value,
        },
    };
}
/**
  * Resolve one setting against an optional per-call override.
  *
  * A concrete setting always wins. `model` defers to the tool argument, then
  * to `fallback` (used for Codex access = read-only and Grok effort = high).
  */
export function resolveChoice(setting, override, fallback) {
    if (setting !== 'model')
        return setting;
    return override ?? fallback;
}
/** Fold the durable section and this call's optional overrides into argv knobs. */
export function resolveRunPolicy(settings, harness, overrides) {
    const policy = settings[harness];
    return {
        access: resolveChoice(policy.access, overrides.access, harness === 'codex' ? 'read-only' : undefined),
        effort: resolveChoice(policy.effort, overrides.effort, harness === 'grok' ? 'high' : undefined),
    };
}
