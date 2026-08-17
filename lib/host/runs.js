/**
 * In-memory store of harness runs: the single source of truth the tool writes
 * and the browser reads.
 *
 * It owns everything the adapters deliberately do not: run identity, event
 * sequencing and relative timestamps, the bounded retention window, the
 * accumulated reply text, and projection into the shared {@link RunSummary} /
 * {@link RunDetail} shapes.
 *
 * Retention is a per-run ring buffer. When it evicts, the eviction is counted
 * into `droppedEvents` and `seq` keeps climbing, so a client can tell "nothing
 * new" from "you missed some" — a silently truncated timeline would read as a
 * run that simply did less work. Adjacent same-kind reply/reasoning deltas are
 * folded together before they can consume a slot, so the window measures work
 * rather than tokens; {@link mergeDelta} states the sequencing invariant that
 * makes the fold invisible to an incrementally polling client.
 *
 * State is process-lifetime only: runs describe live external processes, and a
 * run that outlives the harness process has nothing left to poll.
 *
 * @module dsh-harness-call/host/runs
 */
/** Project the mutable record into a detached summary a poll can serialize safely. */
function toSummary(record) {
    return {
        runId: record.runId,
        harness: record.harness,
        callId: record.callId,
        label: record.label,
        phase: record.phase,
        mode: record.mode,
        sessionId: record.sessionId,
        cwd: record.cwd,
        promptPreview: record.promptPreview,
        promptCharacters: record.promptCharacters,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        elapsedMs: record.elapsedMs,
        ok: record.ok,
        errors: [...record.errors],
        eventCount: record.eventCount,
        droppedEvents: record.droppedEvents,
        lastEventKind: record.lastEventKind,
        costUsd: record.costUsd,
        turns: record.turns,
    };
}
export class RunStore {
    options;
    /**
     * Insertion-ordered, and insertion order IS `startedAt` order because ids are
     * handed out monotonically — so eviction can scan from the front for the
     * oldest finished run without sorting.
     */
    records = new Map();
    runCounter = 0;
    constructor(options) {
        this.options = options;
    }
    /** Open a run and return its write surface. */
    open(spec) {
        // Process-local counter, not a UUID: run ids only have to be unique within
        // this process (nothing persists them) and readable in a log line.
        this.runCounter += 1;
        const runId = `r${this.runCounter}`;
        const record = {
            runId,
            harness: spec.harness,
            callId: spec.callId,
            label: spec.label,
            mode: spec.mode,
            cwd: spec.cwd,
            promptPreview: preview(spec.prompt, this.options.promptPreviewCharacters),
            promptCharacters: spec.prompt.length,
            startedAt: Date.now(),
            phase: 'starting',
            sessionId: spec.sessionId,
            errors: [],
            eventCount: 0,
            droppedEvents: 0,
            text: '',
            events: [],
            deliveredSeq: 0,
        };
        this.records.set(runId, record);
        this.evict();
        return {
            runId,
            markRunning: () => {
                record.phase = 'running';
            },
            append: (events) => {
                this.appendTo(record, events);
            },
            finish: (result) => {
                const finishedAt = Date.now();
                record.phase = 'done';
                record.ok = result.ok;
                record.errors = [...result.errors];
                record.text = result.text;
                record.sessionId = result.sessionId;
                record.finishedAt = finishedAt;
                record.elapsedMs = finishedAt - record.startedAt;
                if (result.extras.costUsd !== undefined)
                    record.costUsd = result.extras.costUsd;
                if (result.extras.numTurns !== undefined)
                    record.turns = result.extras.numTurns;
                // A finishing run is the moment a previously unevictable run becomes
                // evictable, so the bound converges even if no further run opens.
                this.evict();
            },
        };
    }
    /**
     * Every known run, newest first.
     *
     * `startedAt` is millisecond wall clock, so two runs opened in the same tick
     * — the normal case when the model fires several harness calls in parallel —
     * compare equal. `sort` is stable, which would then preserve the input order;
     * reversing the insertion order first therefore makes the tie break toward the
     * more recently opened run, so "newest first" holds for the whole list and not
     * just for runs that happened to land in different milliseconds. Insertion
     * order is the run counter's order, as the `records` doc states.
     */
    list() {
        return [...this.records.values()].reverse().sort((a, b) => b.startedAt - a.startedAt).map(toSummary);
    }
    /**
     * One run's summary plus its events after `sinceSeq`.
     * @returns `null` when the run id is unknown or has been evicted.
     */
    get(runId, sinceSeq) {
        const record = this.records.get(runId);
        if (record === undefined)
            return null;
        // Retained seqs are contiguous, so the slice start is arithmetic rather
        // than a scan. A cursor older than the window clamps to 0 and the client
        // gets everything still retained plus the `droppedEvents` count that
        // explains the gap.
        const oldest = record.events[0];
        const start = oldest === undefined
            ? 0
            : Math.min(record.events.length, Math.max(0, sinceSeq - oldest.seq + 1));
        // Everything retained is now in a caller's hands, so nothing retained may
        // change again. `Math.max` keeps the mark monotonic across several clients
        // polling the same run at different cursors: the highest mark wins, which
        // merges less rather than mutating an event some client already holds.
        record.deliveredSeq = Math.max(record.deliveredSeq, record.eventCount);
        return {
            summary: toSummary(record),
            events: record.events.slice(start),
            // The highest seq ASSIGNED, not the last one retained: a poll that
            // returned no new events must still advance the client past events the
            // ring buffer dropped, or the cursor would stall forever.
            cursor: record.eventCount,
            text: record.text,
        };
    }
    appendTo(record, events) {
        const at = Date.now() - record.startedAt;
        for (const event of events) {
            // A delta folded into the tail event consumes no `seq` and cannot evict,
            // so only a genuinely new event advances the counters. The per-event side
            // effects below still run either way: `record.text` accumulates the delta
            // regardless of which event carries it.
            if (!mergeDelta(record, event)) {
                record.eventCount += 1;
                record.events.push({ ...event, seq: record.eventCount, at });
                if (record.events.length > this.options.maxEventsPerRun) {
                    record.events.shift();
                    record.droppedEvents += 1;
                }
            }
            record.lastEventKind = event.kind;
            switch (event.kind) {
                case 'session':
                    // The harness confirmed which session this run actually reads/writes;
                    // it may differ from the one the orchestrator requested.
                    record.sessionId = event.sessionId;
                    break;
                case 'text':
                    record.text += event.text;
                    break;
                case 'usage':
                    if (event.costUsd !== undefined)
                        record.costUsd = event.costUsd;
                    if (event.turns !== undefined)
                        record.turns = event.turns;
                    break;
                default:
                    break;
            }
        }
    }
    /**
     * Drop the oldest FINISHED runs until the roster fits. A live run is never a
     * candidate: it still has a handle writing into it, and evicting it would
     * make the browser's poll for a run that is visibly in progress return null.
     */
    evict() {
        while (this.records.size > this.options.maxRuns) {
            let victim;
            for (const [id, record] of this.records) {
                if (record.phase === 'done') {
                    victim = id;
                    break;
                }
            }
            if (victim === undefined)
                return;
            this.records.delete(victim);
        }
    }
}
/**
 * Fold a `text`/`reasoning` delta into the retained tail event when that event
 * is still private to the store; report whether it did.
 *
 * WHY: the harnesses stream at wildly different granularity. Grok's
 * `streaming-json` emits ONE FRAME PER TOKEN (`{"type":"thought","data":"The"}`),
 * so one 3000-token reasoning block would consume 3000 ring-buffer slots and
 * evict every `session` / `text` / `error` event the 400-slot window exists to
 * keep — the window would be measuring tokens instead of work. Merging makes a
 * slot hold a semantic chunk again.
 *
 * THE INVARIANT IT MUST NOT BREAK: a client polls `get(runId, sinceSeq)`, keeps
 * every event it is handed, and thereafter only asks for `seq > sinceSeq`. So an
 * event a client already holds can never change — mutating one would leave that
 * client rendering stale text forever, and re-issuing the merged event under a
 * fresh `seq` (retiring the old one) would make the client append text it is
 * already displaying, showing the same prefix twice.
 *
 * So merging is permitted ONLY into an event no client has seen yet: `get`
 * raises `deliveredSeq` to the cursor it hands out, and the tail event may
 * absorb a delta only while its `seq` is beyond that mark. Sequence numbers are
 * therefore never reused, reassigned, or retired — a merged delta simply
 * consumes no number of its own, which keeps `eventCount` equal to the highest
 * `seq` assigned and keeps retained `seq`s contiguous for `get`'s arithmetic
 * slice.
 *
 * The price is that merging is bounded by poll cadence rather than by meaning: a
 * watched run starts a fresh event at every poll boundary, so the window holds
 * roughly one event per kind per poll rather than one per reply. That still
 * collapses per-token frames by orders of magnitude, and it is the only bound
 * that can never show a client text that disagrees with the host.
 *
 * The fold is an EXACT concatenation, never a join with a separator: the same
 * `text` deltas also accumulate into `record.text`, and any separator invented
 * here would make the timeline disagree with the reply. An adapter that emits
 * whole blocks rather than token deltas therefore has two adjacent blocks read
 * as one paragraph in the panel; an adapter that wants them visibly apart owns
 * that, by emitting the separation as part of its delta the way codex's
 * `agent_message` does.
 *
 * `at` stays that of the delta that opened the event, which is the honest answer
 * to "when did this text start".
 */
function mergeDelta(record, event) {
    if (event.kind !== 'text' && event.kind !== 'reasoning')
        return false;
    const tail = record.events[record.events.length - 1];
    if (tail === undefined || tail.seq <= record.deliveredSeq)
        return false;
    if (tail.kind !== 'text' && tail.kind !== 'reasoning')
        return false;
    if (tail.kind !== event.kind)
        return false;
    tail.text += event.text;
    return true;
}
/** Head of the prompt, marked when cut so a card never implies it showed all of it. */
function preview(prompt, max) {
    return prompt.length > max ? `${prompt.slice(0, max)}…` : prompt;
}
