/**
 * The adapter registry.
 *
 * Typed as {@link HarnessAdapterRegistry}, which is total over {@link HarnessKey}:
 * adding a key to the shared roster without adding its adapter here is a
 * compile error, not a runtime "unknown harness".
 *
 * @module dsh-harness-call/host/adapters
 */
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { grokAdapter } from "./grok.js";
export const ADAPTERS = {
    claude: claudeAdapter,
    codex: codexAdapter,
    grok: grokAdapter,
};
