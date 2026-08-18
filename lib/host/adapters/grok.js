/**
 * Grok CLI adapter: `grok -p <prompt> --output-format streaming-json`.
 *
 * Session handling: `--session-id <id>` opens a run on a caller-chosen id,
 * `--resume <id>` continues one. Unlike the other two harnesses the prompt is
 * an argument, not stdin, so this adapter spawns with no stdin at all.
 * Reasoning is pinned to `--reasoning-effort high` so a TUI `xhigh` default
 * cannot leak into delegated one-shot calls.
 *
 * @module dsh-harness-call/host/adapters/grok
 */
import { HARNESS_LABELS } from "../../shared/harness.js";
import { exitFailure, isRecord, readNumber, readString } from "./native.js";
export const grokAdapter = {
    key: 'grok',
    label: HARNESS_LABELS.grok,
    bin: 'grok',
    createState() {
        return { text: '', tools: new Map() };
    },
    build(req) {
        // The prompt travels as an argument: this CLI takes no stdin, so the
        // spawn asks for none at all rather than handing it an empty pipe.
        const argv = [
            '-p',
            req.prompt,
            '--cwd',
            req.cwd,
            req.mode === 'resume' ? '--resume' : '--session-id',
            req.sessionId,
            '--output-format',
            'streaming-json',
            '--background-wait-timeout',
            String(req.timeoutSeconds),
            // ~/.grok/config.toml can set default_reasoning_effort = "xhigh". That
            // is a TUI preference; inheriting it here turned a 300-character fable
            // into a 2-minute, 3-loop run (observed: 70s max time-to-first-token).
            // `high` still reasons, without paying the interactive-coding tax.
            '--reasoning-effort',
            'high',
        ];
        return { argv, stdin: null, env: {} };
    },
    translate(native, state) {
        if (!isRecord(native))
            return [];
        const type = native['type'];
        if (type === 'text') {
            const text = readString(native, 'data');
            if (text !== undefined) {
                // Grok's text frames are deltas, so they accumulate.
                state.text += text;
                return [{ kind: 'text', text }];
            }
        }
        else if (type === 'thought') {
            /*
             * Reasoning, and it arrives ONE TOKEN PER FRAME
             * (`{"type":"thought","data":"The"}`). Two consequences the previous
             * fall-through got wrong: the token itself was dropped (the note carried
             * only the word "thought"), and a normal reasoning block spent thousands
             * of ring-buffer slots on content-free notes, evicting the session, reply,
             * and error events. Emitting it as `reasoning` both keeps the content and
             * lets the store fold adjacent deltas into one event.
             */
            const text = readString(native, 'data');
            if (text !== undefined)
                return [{ kind: 'reasoning', text }];
        }
        else if (type === 'available_commands') {
            /*
             * Dropped on purpose. It is a ~2KB static list of the CLI's own tools and
             * slash commands, re-announced 3+ times per run, identical every time. It
             * describes what grok CAN do, never anything this run DID, so the
             * "unrecognized frames still mark work" fallback does not apply: each copy
             * would only cost a retention slot and a line of the bounded digest the
             * model reads.
             */
            return [];
        }
        else if (type === 'tool_call') {
            /*
             * Frame shape (observed on grok's streaming-json):
             * `{"type":"tool_call","toolCallId":"call-…","title":"read_file",
             *   "kind":"read","status":"pending","toolName":"read_file",
             *   "rawInput":{"target_file":"…"},"content":[],"locations":[]}`.
             * `input` is attached only when present: an own key with an `undefined`
             * value fails the Remote boundary's JSON validation.
             */
            const name = readString(native, 'toolName') ?? readString(native, 'title');
            if (name === undefined)
                return [{ kind: 'note', text: 'tool_call' }];
            const callId = readString(native, 'toolCallId');
            if (callId !== undefined)
                state.tools.set(callId, name);
            const input = native['rawInput'];
            return [input === undefined ? { kind: 'tool', name } : { kind: 'tool', name, input }];
        }
        else if (type === 'tool_call_update') {
            /*
             * The settlement half of a tool call. Updates with `status: null` carry
             * only locations/progress and are dropped; a terminal status becomes the
             * tool event's exit code, attributed through the id→name table.
             */
            const status = readString(native, 'status');
            if (status !== 'completed' && status !== 'failed')
                return [];
            const callId = readString(native, 'toolCallId');
            const name = (callId !== undefined ? state.tools.get(callId) : undefined) ?? 'tool';
            return [{ kind: 'tool', name, exitCode: status === 'completed' ? 0 : 1 }];
        }
        else if (type === 'usage') {
            /*
             * Mid-run token accounting (`usage` object plus a ~170-character
             * `signature`). It names neither a cost nor a turn count — the `end`
             * frame carries both — so there is nothing honest to show, and the
             * signature must never reach a timeline row.
             */
            return [];
        }
        else if (type === 'end') {
            // The closing frame is a verdict, not something to show: `finalize`
            // reads its session id and stop reason.
            state.end = native;
            return [];
        }
        else if (type === 'error') {
            state.error = native;
            const message = readString(native, 'message');
            return [{ kind: 'error', message: message !== undefined && message.trim() !== '' ? message : 'grok error' }];
        }
        return [{ kind: 'note', text: String(type) }];
    },
    finalize(state, outcome, info) {
        const errors = [];
        if (info.timedOut)
            errors.push(`grok exceeded ${info.timeoutSeconds}s and was terminated`);
        const exit = exitFailure('grok', outcome);
        if (exit !== undefined)
            errors.push(exit);
        if (state.error !== undefined) {
            const message = readString(state.error, 'message');
            errors.push(`grok error: ${message !== undefined && message.trim() !== '' ? message : 'unknown'}`);
        }
        else if (state.end === undefined) {
            errors.push('missing grok end event');
        }
        else {
            // A different session id means this reply belongs to another
            // conversation — worse than no reply, because it would look valid.
            const sessionId = state.end['sessionId'];
            if (sessionId !== info.sessionId) {
                errors.push(`end event session mismatch: expected ${info.sessionId}, got ${String(sessionId ?? 'missing')}`);
            }
            const stopReason = state.end['stopReason'];
            if (stopReason !== 'EndTurn' && stopReason !== 'end_turn') {
                errors.push(`unexpected grok stop reason: ${String(stopReason ?? 'missing')}`);
            }
        }
        return {
            ok: errors.length === 0,
            text: state.text,
            // Grok runs on the caller-chosen id, so the requested one stands even
            // when the closing frame never arrived.
            sessionId: readString(state.end, 'sessionId') ?? info.sessionId,
            errors,
            // The closing frame accounts for the run: `"num_turns":1,
            // "total_cost_usd":0.00649026`. Reading it is what makes the card's cost
            // and turn lines say anything at all for this harness.
            extras: { costUsd: readNumber(state.end, 'total_cost_usd'), numTurns: readNumber(state.end, 'num_turns') },
        };
    },
};
