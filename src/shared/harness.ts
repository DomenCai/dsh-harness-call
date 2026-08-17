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
export const HARNESS_KEYS = ['claude', 'codex', 'grok'] as const

/** Key of a supported external harness. */
export type HarnessKey = (typeof HARNESS_KEYS)[number]

/** Human-facing name of each harness, used by cards, panels, and errors. */
export const HARNESS_LABELS: Readonly<Record<HarnessKey, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok',
}

/** Narrow an untrusted model-supplied value to a known harness key. */
export function isHarnessKey(value: unknown): value is HarnessKey {
  return typeof value === 'string' && (HARNESS_KEYS as readonly string[]).includes(value)
}
