/**
 * The floating overlay panel: one run's full timeline and reply.
 *
 * This is where the normalized event union pays off. The model-facing tool
 * result flattens every event onto one 160-character line; here each kind keeps
 * its own shape — a tool call shows its name, exit code and (on demand) its
 * complete arguments, a file shows its path and what happened to it, reasoning
 * stays visibly secondary, errors get their own block, and accounting sits in
 * the footer. Events the host's ring buffer evicted are announced rather than
 * skipped, so a timeline that starts mid-run always says so.
 *
 * The panel is a `shell.overlay` entry, not a details-column occupant. That
 * layer is click-through, and this component renders exactly ONE box — the
 * panel itself — so it takes pointer events over its own area and nothing else:
 * there is deliberately no backdrop element to cover the app underneath.
 *
 * @module dsh-harness-call/client/HarnessPanel
 */
import { type ReactNode } from 'react';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { HarnessTranslate } from './contracts.ts';
import { type HarnessResult, type RunFeed } from './runs.ts';
/**
 * What the card hands the panel when it is clicked. A snapshot of that moment,
 * never refreshed: nothing here may be used as a liveness signal.
 *
 * There is no `runId` of its own — the only run handle is `result.runId`, and it
 * exists exactly when the call has settled AND the host got far enough to open a
 * run record. A card that is still running knows only its `callId`, so the panel
 * resolves the run the same way the card does; a call that failed before any run
 * existed has neither handle, and its result is all there is to show.
 */
export interface PanelTarget {
    /** The tool call the card was rendered for; the correlation key. */
    callId: string;
    /**
     * The conversation session the card lives in. The overlay layer is
     * root-scoped — it survives every session switch — so the panel's own owner
     * has to travel with the target.
     */
    sessionId: SessionId;
    harness: string | undefined;
    label: string;
    /** The prompt the model composed, shown while the run is still going. */
    prompt: string | undefined;
    /** The settled tool result, when there is one. */
    result: HarnessResult | undefined;
}
/**
 * The floating panel for one harness run.
 *
 * @param props - the clicked target, the page run feed, bound translate, and
 *   the panel's own close action.
 * @returns the panel tree.
 */
export declare function HarnessPanel(props: {
    target: PanelTarget;
    feed: RunFeed;
    t: HarnessTranslate;
    onClose: () => void;
}): ReactNode;
