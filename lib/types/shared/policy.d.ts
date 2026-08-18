/**
  * Launch policy shared by the host adapters, the model tool, and the
  * settings page. Zero runtime dependencies — see the note in ./events.ts.
  *
  * @module dsh-harness-call/shared/policy
  */
import { type HarnessKey } from './harness.ts';
/** Concrete filesystem / approval posture passed to a CLI. */
export declare const ACCESS_MODES: readonly ["read-only", "workspace-write", "full-access"];
/** {@link ACCESS_MODES} plus the "let this call decide" sentinel. */
export declare const ACCESS_SETTINGS: readonly ["read-only", "workspace-write", "full-access", "model"];
/** Concrete reasoning effort passed to a CLI. */
export declare const EFFORT_LEVELS: readonly ["low", "medium", "high", "xhigh"];
/** {@link EFFORT_LEVELS} plus the "let this call decide" sentinel. */
export declare const EFFORT_SETTINGS: readonly ["low", "medium", "high", "xhigh", "model"];
/** One concrete access mode. */
export type AccessMode = (typeof ACCESS_MODES)[number];
/** Access mode or `model` (the tool argument, if any, wins). */
export type AccessSetting = (typeof ACCESS_SETTINGS)[number];
/** One concrete effort level. */
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
/** Effort level or `model` (the tool argument, if any, wins). */
export type EffortSetting = (typeof EFFORT_SETTINGS)[number];
/** Per-harness launch knobs the settings page edits. */
export interface HarnessPolicy {
    readonly access: AccessSetting;
    readonly effort: EffortSetting;
}
/** Durable settings section for every rostered harness. */
export type HarnessCallSettings = {
    readonly [K in HarnessKey]: HarnessPolicy;
};
/** One field write from the settings page. */
export type HarnessCallSettingsUpdate = {
    readonly harness: HarnessKey;
    readonly field: 'access';
    readonly value: AccessSetting;
} | {
    readonly harness: HarnessKey;
    readonly field: 'effort';
    readonly value: EffortSetting;
};
/** Fresh defaults: leave Claude/Codex to the call; pin Grok effort so TUI `xhigh` cannot leak. */
export declare function defaultHarnessCallSettings(): HarnessCallSettings;
/** Whether an untrusted value is a concrete access mode. */
export declare function isAccessMode(value: unknown): value is AccessMode;
/** Whether an untrusted value is an access setting (including `model`). */
export declare function isAccessSetting(value: unknown): value is AccessSetting;
/** Whether an untrusted value is a concrete effort level. */
export declare function isEffortLevel(value: unknown): value is EffortLevel;
/** Whether an untrusted value is an effort setting (including `model`). */
export declare function isEffortSetting(value: unknown): value is EffortSetting;
/**
  * Fill any missing harness / field from {@link defaultHarnessCallSettings}.
  * A partial stored section (or a missing settings provider) must still be
  * something `adapter.build` can read without optional chaining on every key.
  */
export declare function normalizeHarnessCallSettings(value: unknown): HarnessCallSettings;
/** Apply one settings-page write onto a normalized section. */
export declare function applyHarnessCallSettingsUpdate(current: HarnessCallSettings, update: HarnessCallSettingsUpdate): HarnessCallSettings;
/**
  * Resolve one setting against an optional per-call override.
  *
  * A concrete setting always wins. `model` defers to the tool argument, then
  * to `fallback` (used for Codex access = read-only and Grok effort = high).
  */
export declare function resolveChoice<T>(setting: T | 'model', override: T | undefined, fallback?: T): T | undefined;
/** The concrete knobs one spawn should apply, after settings + tool args. */
export interface ResolvedRunPolicy {
    readonly access: AccessMode | undefined;
    readonly effort: EffortLevel | undefined;
}
/** Fold the durable section and this call's optional overrides into argv knobs. */
export declare function resolveRunPolicy(settings: HarnessCallSettings, harness: HarnessKey, overrides: {
    readonly access?: AccessMode;
    readonly effort?: EffortLevel;
}): ResolvedRunPolicy;
