import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { HARNESS_LABELS, isHarnessKey } from "../shared/harness.js";
import css from './HarnessCall.module.css';
import { brief, matchRun, readArgs, readResult, seconds, useChannel, useRoster } from "./runs.js";
/** Cap of the prompt excerpt shown on a running card. */
const PROMPT_EXCERPT_CHARACTERS = 140;
/** How many failure reasons fit on a card before the panel should be opened. */
const CARD_ERROR_LINES = 4;
/** Human name of a harness, falling back to whatever the model actually asked for. */
function harnessLabel(harness) {
    if (isHarnessKey(harness))
        return HARNESS_LABELS[harness];
    return harness ?? 'harness';
}
/** The live status line of a running call: how long, how much, doing what. */
function liveStatus(summary, t) {
    const bits = [t('card.elapsed', { n: seconds(Date.now() - summary.startedAt) })];
    if (summary.eventCount > 0)
        bits.push(t('card.events', { n: summary.eventCount }));
    if (summary.lastEventKind !== undefined) {
        bits.push(t('card.last', { type: t(`event.${summary.lastEventKind}`) }));
    }
    return bits.join(' · ');
}
/** Keep a disclosure toggle from also opening the details panel. */
function swallow(event) {
    event.stopPropagation();
}
/**
 * One tool-call card.
 *
 * @param props - the call identity and session the slot owner supplies, the
 *   running-or-settled block, the page run feed, bound translate, and the panel
 *   opener.
 * @returns the card tree.
 */
export function HarnessCallCard(props) {
    const { callId, sessionId, block, feed, t, onOpen } = props;
    // Only the settled half of the union carries a `kind`; the running call has
    // no discriminant field of its own.
    const settled = 'kind' in block;
    const args = readArgs(block);
    const result = readResult(block);
    // A settled card needs no roster: its own result carries the runId, so the
    // shared poller stops as soon as the last live call lands.
    const runs = useRoster(feed, !settled);
    const channel = useChannel(feed, !settled);
    const summary = settled ? undefined : matchRun(runs, callId, args.harness);
    const label = result?.label ?? summary?.label ?? harnessLabel(args.harness);
    const channelError = settled ? undefined : channel.error;
    const open = () => {
        onOpen({
            callId,
            sessionId,
            harness: args.harness ?? summary?.harness,
            label,
            prompt: args.prompt,
            result,
        });
    };
    if (settled) {
        const ok = result?.ok === true;
        const text = result?.text ?? '';
        const errors = result?.errors ?? [];
        const head = [];
        if (result?.elapsedMs !== undefined)
            head.push(`${seconds(result.elapsedMs)}s`);
        if (result?.steps !== undefined)
            head.push(t('card.events', { n: result.steps }));
        return (_jsxs("div", { className: css.card, title: t('card.openDone'), onClick: open, children: [_jsxs("div", { className: css.head, children: [_jsx(StateDot, { state: ok ? 'done' : 'error', className: css.dot }), _jsx("span", { className: css.label, children: label }), _jsx("span", { className: css.meta, children: head.join(' · ') })] }), ok && text.length > 0 && _jsx("div", { className: css.reply, children: text }), result?.sessionId !== undefined && (_jsx("div", { className: css.meta, children: `session ${result.sessionId} · ${t(result.mode === 'resume' ? 'card.sessionResume' : 'card.sessionNew')}` })), errors.length > 0 && (_jsx("div", { className: css.cardErrors, children: errors.slice(0, CARD_ERROR_LINES).join('\n') })), text.length > 0 && (_jsx("div", { onClick: swallow, children: _jsxs("details", { className: css.disclosure, children: [_jsx("summary", { children: t('card.expandFull', { n: text.length }) }), _jsx("div", { className: css.disclosureText, children: text })] }) }))] }));
    }
    // `null` is the host saying the harness never reported a session id.
    const liveSession = summary?.sessionId;
    return (_jsxs("div", { className: css.card, title: t('card.openRunning'), onClick: open, children: [_jsxs("div", { className: css.head, children: [_jsx(StateDot, { state: "ongoing", className: css.dot }), _jsx("span", { className: css.label, children: `${label} · ${t('card.running')}` })] }), _jsx("div", { className: css.status, children: channelError !== undefined
                    ? t('card.channelDown')
                    : summary === undefined || summary.phase === 'starting'
                        ? t('card.starting')
                        : liveStatus(summary, t) }), channelError !== undefined && _jsx("div", { className: css.cardErrors, children: channelError }), liveSession !== null && liveSession !== undefined && (_jsx("div", { className: css.meta, children: `session ${liveSession}` })), args.prompt !== undefined && (_jsx("div", { className: css.promptExcerpt, children: brief(args.prompt, PROMPT_EXCERPT_CHARACTERS) }))] }));
}
