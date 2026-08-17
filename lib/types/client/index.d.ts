/**
 * dsh-harness-call — browser half.
 *
 * Contributions:
 * - an `@` composer trigger source offering @claude / @codex / @grok;
 * - a `harness_call` tool card showing the live timeline while the external
 *   agent works, and its reply once it finishes;
 * - a floating `shell.overlay` panel with the full timeline and reply text.
 *
 * Everything it displays comes from the host's `harnessCall` Remote, mounted
 * from the descriptors in ../shared/wire.ts — the same constant the host
 * embeds in its Typert manifest, so the two faces cannot drift.
 *
 * @module dsh-harness-call/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services; the fiber stays pending until every one is present. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
