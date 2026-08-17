/**
 * Claude Code adapter: `claude --print --verbose --output-format stream-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. The prompt goes over stdin.
 *
 * @module dsh-harness-call/host/adapters/claude
 */
import { HARNESS_LABELS } from "../../shared/harness.js";
import { exitFailure, isRecord, readNumber, readRecord, readString } from "./native.js";
export const claudeAdapter = {
    key: 'claude',
    label: HARNESS_LABELS.claude,
    bin: 'claude',
    createState() {
        return { text: '' };
    },
    build(req) {
        const argv = ['--print', '--verbose', '--output-format', 'stream-json'];
        argv.push(req.mode === 'resume' ? '--resume' : '--session-id', req.sessionId);
        return {
            argv,
            stdin: req.prompt,
            // A Claude Code host may inject short-lived gateway credentials into the
            // environment; the spawned CLI must run on its own credential store, so
            // both are tombstoned. `undefined` REMOVES the inherited variable — it
            // does not set it to an empty string, which the CLI would still try to
            // use as a base URL.
            env: { ANTHROPIC_AUTH_TOKEN: undefined, ANTHROPIC_BASE_URL: undefined },
        };
    },
    translate(native, state) {
        if (!isRecord(native))
            return [];
        const type = native['type'];
        if (type === 'assistant') {
            // Sub-agent traffic rides the same stream, tagged with the tool call
            // that spawned it. It belongs to that tool's own transcript, not to this
            // run's reply, so it is neither shown nor accumulated.
            if (native['parent_tool_use_id'])
                return [];
            const content = readRecord(native, 'message')?.['content'];
            if (!Array.isArray(content))
                return [];
            const events = [];
            for (const block of content) {
                if (!isRecord(block))
                    continue;
                const blockType = block['type'];
                if (blockType === 'text') {
                    const text = readString(block, 'text');
                    // Whitespace-only blocks are stream padding and carry no reply.
                    if (text === undefined || text.trim() === '')
                        continue;
                    state.text += text;
                    events.push({ kind: 'text', text });
                }
                else if (blockType === 'thinking') {
                    const text = readString(block, 'thinking');
                    if (text === undefined || text.trim() === '')
                        continue;
                    events.push({ kind: 'reasoning', text });
                }
                else if (blockType === 'tool_use') {
                    const name = readString(block, 'name');
                    if (name === undefined)
                        continue;
                    // The whole input is kept: the panel expands it on demand, and a
                    // shortened one could not be inspected after the fact.
                    events.push({ kind: 'tool', name, input: block['input'] });
                }
            }
            return events;
        }
        if (type === 'system' && native['subtype'] === 'init') {
            const sessionId = readString(native, 'session_id');
            return [sessionId === undefined ? { kind: 'note', text: 'session init' } : { kind: 'session', sessionId }];
        }
        if (type === 'result') {
            state.result = native;
            const costUsd = readNumber(native, 'total_cost_usd');
            const turns = readNumber(native, 'num_turns');
            // A `result` event that accounts for nothing is not worth a timeline
            // entry of its own; `finalize` still reads the event from state.
            if (costUsd === undefined && turns === undefined)
                return [];
            return [{ kind: 'usage', costUsd, turns }];
        }
        return [];
    },
    finalize(state, outcome, info) {
        const errors = [];
        const result = state.result;
        if (info.timedOut)
            errors.push(`claude exceeded ${info.timeoutSeconds}s and was terminated`);
        const exit = exitFailure('claude', outcome);
        if (exit !== undefined)
            errors.push(exit);
        if (result === undefined)
            errors.push('missing claude result event');
        else {
            const subtype = result['subtype'];
            const shown = String(subtype ?? '?');
            if (result['is_error'] === true)
                errors.push(`claude error result (subtype ${shown})`);
            else if (subtype !== 'success')
                errors.push(`unexpected claude result subtype: ${shown}`);
            if (readString(result, 'session_id') === undefined)
                errors.push('claude result event has no session_id');
        }
        const finalText = readString(result, 'result');
        return {
            ok: errors.length === 0,
            // The terminal event's text is authoritative; the accumulated deltas are
            // the fallback for a run that died before reporting one.
            text: finalText !== undefined && finalText.length > 0 ? finalText : state.text,
            sessionId: readString(result, 'session_id') ?? null,
            errors,
            extras: { costUsd: readNumber(result, 'total_cost_usd'), numTurns: readNumber(result, 'num_turns') },
        };
    },
};
