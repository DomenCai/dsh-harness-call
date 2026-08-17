/**
 * The harness roster: the one list both halves read.
 *
 * Adding a harness used to mean editing four places (the adapter table, the
 * tool's `harness` enum, the host label map, and the browser's mention list),
 * and nothing failed when one was missed. They all derive from here now, so a
 * new entry reaches the tool schema and the composer mentions at once.
 *
 * Zero runtime dependencies — see the note in ./events.ts.
 *
 * @module dsh-harness-call/shared/harness
 */
/** Harness keys in the order the model and the composer see them. */
export declare const HARNESS_KEYS: readonly ["claude", "codex", "grok"];
/** Key of a supported external harness. */
export type HarnessKey = (typeof HARNESS_KEYS)[number];
/** Human-facing name of each harness, used by cards, panels, and errors. */
export declare const HARNESS_LABELS: Readonly<Record<HarnessKey, string>>;
/** Narrow an untrusted model-supplied value to a known harness key. */
export declare function isHarnessKey(value: unknown): value is HarnessKey;
