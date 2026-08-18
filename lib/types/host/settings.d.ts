/**
  * The `harness-call` settings namespace: per-harness access and effort
  * defaults managed from the Web settings page. Registered with the settings
  * provider at plugin load; the runtime reads the owner scope's live value on
  * every spawn, so changes take effect on the next call without a restart.
  *
  * @module dsh-harness-call/host/settings
  */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type SettingsScope } from '@deepseek-ai/dsh-settings';
import { type HarnessCallSettings, type HarnessCallSettingsUpdate } from '../shared/policy.ts';
/** The branded namespace name. */
export declare const HARNESS_CALL_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Schemastery schema of the `harness-call` namespace section. */
export declare const HarnessCallSettingsSchema: z<HarnessCallSettings>;
/** Register the namespace and return its owner scope. */
export declare function registerHarnessCallSettings(ctx: Context): SettingsScope<HarnessCallSettings>;
/** Live read of the resolved section. */
export declare function readHarnessCallSettings(scope: SettingsScope<HarnessCallSettings>): HarnessCallSettings;
/** Persist one field and return the resolved section. */
export declare function writeHarnessCallSettings(scope: SettingsScope<HarnessCallSettings>, update: HarnessCallSettingsUpdate): Promise<HarnessCallSettings>;
