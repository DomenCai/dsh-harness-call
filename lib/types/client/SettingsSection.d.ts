/**
 * Settings page: per-harness access and reasoning-effort defaults.
 *
 * @module dsh-harness-call/client/SettingsSection
 */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import { type HarnessCallSettings, type HarnessCallSettingsUpdate } from '../shared/policy.ts';
/** Injected business face: the live scope and durable write verbs. */
export interface HarnessSectionInjected {
    hooks: {
        scope: {
            getSnapshot(): {
                value: HarnessCallSettings;
            };
            subscribe(fn: () => void): () => void;
        };
    };
    update: (next: HarnessCallSettingsUpdate) => Promise<void>;
}
/** Full section props: runtime share + injected face + locale seat. */
export type HarnessSectionProps = PropsRuntime<'settings.section'> & InjectFace<HarnessSectionInjected> & PropsLocale<'harness-call'>;
/** Render one card per harness with access + effort selects. */
export declare function HarnessSettingsSection({ useScope, update, t, }: HarnessSectionProps): import("react").JSX.Element;
