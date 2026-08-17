/**
 * The `harness_call` tool card.
 *
 * Two states, one component. While the call is in flight the card is the only
 * window into a process that runs for minutes: it names the harness, counts the
 * events the host has recorded, says what the external agent is doing right now,
 * and shows the prompt the model composed. Once the call settles the same card
 * becomes a result: reply preview, session identity, and the full text behind a
 * disclosure. Either way, clicking it opens the floating run panel.
 *
 * The card reads ONLY the roster (`list`), never a timeline — a page with six
 * live calls costs one small request every couple of seconds, because all six
 * share one poller.
 *
 * @module dsh-harness-call/client/HarnessCallCard
 */
import type { ReactNode } from 'react';
import type { SessionId, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client';
import type { HarnessTranslate } from './contracts.ts';
import type { PanelTarget } from './HarnessPanel.tsx';
import { type RunFeed } from './runs.ts';
/**
 * One tool-call card.
 *
 * @param props - the call identity and session the slot owner supplies, the
 *   running-or-settled block, the page run feed, bound translate, and the panel
 *   opener.
 * @returns the card tree.
 */
export declare function HarnessCallCard(props: {
    callId: string;
    sessionId: SessionId;
    block: ToolCallBlock;
    feed: RunFeed;
    t: HarnessTranslate;
    onOpen: (target: PanelTarget) => void;
}): ReactNode;
