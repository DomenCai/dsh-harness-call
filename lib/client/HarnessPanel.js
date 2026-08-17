import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useRef, useState } from 'react';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './HarnessCall.module.css';
import { brief, matchRun, seconds, useRoster, useRunDetail, } from "./runs.js";
/** Cap of the one-line summary a collapsed tool-argument disclosure shows. */
const INPUT_SUMMARY_CHARACTERS = 72;
/** Format one reported cost for the accounting footer. */
function cost(costUsd) {
    return `$${costUsd.toFixed(4)}`;
}
/**
 * Render one timeline event's body.
 *
 * @param event - the stored event.
 * @param t - bound translate.
 * @returns the body, or `null` for kinds the panel shows elsewhere.
 */
function eventBody(event, t) {
    switch (event.kind) {
        case 'session':
            return _jsx("span", { className: css.note, children: `${t('event.session')} ${event.sessionId}` });
        case 'reasoning':
            return _jsx("span", { className: css.reasoning, children: event.text });
        case 'text':
            return event.text;
        case 'tool':
            return (_jsxs("div", { className: css.tool, children: [_jsx("span", { className: css.toolName, children: event.name }), event.exitCode !== undefined && (_jsx("span", { className: css.toolExit, children: t('event.exit', { code: event.exitCode }) })), event.input !== undefined && (_jsxs("details", { className: css.disclosure, children: [_jsx("summary", { children: `${t('event.input')} · ${brief(event.input, INPUT_SUMMARY_CHARACTERS)}` }), _jsx("pre", { className: css.pre, children: JSON.stringify(event.input, null, 2) ?? '' })] }))] }));
        case 'file':
            return (_jsxs("span", { className: css.file, children: [_jsx("span", { className: css.fileChange, children: t(`file.${event.change}`) }), _jsx("span", { className: css.filePath, children: event.path })] }));
        case 'error':
            return _jsx("div", { className: css.rowError, children: event.message });
        case 'usage':
            // Accounting is a run-level fact, not a moment in the process: it renders
            // once in the footer from the summary instead of inside the timeline.
            return null;
        case 'note':
            return _jsx("span", { className: css.note, children: event.text });
    }
}
/**
 * The floating panel for one harness run.
 *
 * @param props - the clicked target, the page run feed, bound translate, and
 *   the panel's own close action.
 * @returns the panel tree.
 */
export function HarnessPanel(props) {
    const { target, feed, t, onClose } = props;
    const result = target.result;
    /**
     * Only an UNSETTLED target consults the roster. A settled one either carries
     * its own `runId` or never had a run at all (the early-exit results in
     * host/tool.ts report no run), and guessing from the roster there would attach
     * a stranger's complete timeline to this call's failure.
     */
    const searching = result === undefined;
    /**
     * ...and it stops consulting it once the run it found is over. The roster is
     * the shared page poller: leaving this subscription open would keep the whole
     * page polling `list()` for as long as the panel stays open. Dropping it does
     * not lose the answer — the feed keeps its last snapshot, so `matchRun` still
     * resolves the same run on every later render.
     */
    const [found, setFound] = useState(false);
    const runs = useRoster(feed, searching && !found);
    const run = searching ? matchRun(runs, target.callId, target.harness) : undefined;
    const runId = result?.runId ?? run?.runId;
    const view = useRunDetail(feed, runId, result !== undefined);
    const summary = view?.summary;
    const phase = summary?.phase ?? run?.phase;
    useEffect(() => {
        if (phase === 'done')
            setFound(true);
    }, [phase]);
    // Escape closes the panel: it floats over the whole app, so the keyboard needs
    // a way out that does not involve locating the close button.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
    }, [onClose]);
    /**
     * Focus lands in the panel when it opens, so Tab reaches the close button and
     * the disclosures instead of continuing through the conversation behind it.
     */
    const root = useRef(null);
    useEffect(() => { root.current?.focus(); }, []);
    const done = summary === undefined ? result !== undefined : summary.phase === 'done';
    const errors = summary !== undefined && summary.errors.length > 0
        ? summary.errors
        : result?.errors ?? [];
    const failed = errors.length > 0 || summary?.ok === false || result?.ok === false;
    const dot = failed ? 'error' : done ? 'done' : 'ongoing';
    const text = view !== undefined && view.text.length > 0 ? view.text : result?.text ?? '';
    const elapsedMs = summary !== undefined
        ? summary.elapsedMs ?? Date.now() - summary.startedAt
        : result?.elapsedMs;
    const mode = summary?.mode ?? result?.mode;
    const sessionId = summary?.sessionId ?? result?.sessionId;
    const meta = [];
    if (sessionId !== undefined)
        meta.push(`session ${sessionId}`);
    if (mode !== undefined)
        meta.push(t(mode === 'resume' ? 'panel.sessionResume' : 'panel.sessionNew'));
    if (elapsedMs !== undefined)
        meta.push(`${seconds(elapsedMs)}s`);
    if (summary?.cwd !== undefined)
        meta.push(summary.cwd);
    else if (result?.cwd !== undefined)
        meta.push(result.cwd);
    const events = view?.events ?? [];
    const dropped = summary?.droppedEvents ?? 0;
    // Accounting falls back to the tool result, which carries the same two numbers:
    // the store is in-memory, so a card reopened after a host restart has no live
    // summary left and would otherwise lose its billing footer.
    const costUsd = summary?.costUsd ?? result?.costUsd;
    const turns = summary?.turns ?? result?.turns;
    const accounting = [];
    if (costUsd !== undefined)
        accounting.push(cost(costUsd));
    if (turns !== undefined)
        accounting.push(t('panel.usageTurns', { turns }));
    const empty = events.length === 0 && text.length === 0 && errors.length === 0;
    const title = t('panel.title', { label: target.label });
    return (_jsxs("aside", { ref: root, className: css.panel, role: "dialog", "aria-label": title, "aria-busy": done ? undefined : true, 
        // Programmatically focusable only: the panel is a surface to read, the
        // close button is the thing in it worth tabbing to.
        tabIndex: -1, children: [_jsxs("div", { className: css.panelHead, children: [_jsx(StateDot, { state: dot, className: css.dot }), _jsx("span", { children: title }), _jsx("button", { type: "button", className: css.panelClose, "aria-label": t('panel.close'), title: t('panel.close'), onClick: onClose, children: "\u2715" })] }), _jsx("div", { className: css.panelMeta, children: meta.length > 0 ? meta.join(' · ') : t('panel.waiting') }), _jsxs("div", { className: css.panelBody, children: [dropped > 0 && _jsx("div", { className: css.notice, children: t('panel.dropped', { n: dropped }) }), events.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: css.sectionLabel, children: t('panel.process', { n: events.length }) }), _jsx("div", { className: css.timeline, children: events.map((event) => {
                                    const body = eventBody(event, t);
                                    // Kinds shown elsewhere contribute no row rather than a blank one.
                                    if (body === null)
                                        return null;
                                    return (_jsxs("div", { className: css.row, children: [_jsx("span", { className: css.rowTime, children: `${seconds(event.at)}s` }), _jsx("div", { className: css.rowBody, children: body })] }, event.seq));
                                }) })] })), errors.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: css.sectionLabel, children: t('panel.errors') }), _jsx("div", { className: css.errors, children: errors.join('\n') })] })), text.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: css.sectionLabel, children: t(done ? 'panel.reply' : 'panel.replyRunning') }), _jsx("div", { className: css.panelText, children: text })] })), empty && _jsx("div", { className: css.hint, children: t('panel.noOutput') }), !done && target.prompt !== undefined && (_jsxs(_Fragment, { children: [_jsx("div", { className: css.sectionLabel, children: t('panel.prompt') }), _jsx("div", { className: css.prompt, children: target.prompt })] }))] }), accounting.length > 0 && _jsx("div", { className: css.panelFoot, children: accounting.join(' · ') })] }));
}
