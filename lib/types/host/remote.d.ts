/**
 * The `harnessCall` Cordis service, exposed to the browser over Typert Remote.
 *
 * A projection of {@link RunStore} plus the durable settings namespace. The
 * run methods hold no state of their own, so a browser poll can never race
 * the tool's writes into an inconsistent view.
 *
 * `implements HarnessCallRemote` is load-bearing — it is the compiler check
 * that the methods the browser mounts descriptors for actually exist here with
 * the signatures the shared contract promises.
 *
 * @module dsh-harness-call/host/remote
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { RunDetail, RunSummary } from '../shared/events.ts';
import type { HarnessCallSettings, HarnessCallSettingsUpdate } from '../shared/policy.ts';
import { type HarnessCallRemote } from '../shared/wire.ts';
import type { RunStore } from './runs.ts';
export declare class HarnessCallRemoteService extends TypertRemoteService implements HarnessCallRemote {
    private readonly runs;
    private readonly readSettings;
    private readonly writeSettings;
    constructor(ctx: Context, runs: RunStore, readSettings: () => HarnessCallSettings, writeSettings: (update: HarnessCallSettingsUpdate) => Promise<HarnessCallSettings>);
    /** Every known run, newest `startedAt` first. */
    list(): Promise<RunSummary[]>;
    /**
     * One run's summary plus the events after `sinceSeq`.
     * @param runId - run identity from a {@link RunSummary}.
     * @param sinceSeq - highest `seq` the caller already holds.
     * @returns the detail, or `null` when the run id is unknown.
     */
    get(runId: string, sinceSeq: number): Promise<RunDetail | null>;
    /** Current per-harness access / effort settings. */
    getSettings(): Promise<HarnessCallSettings>;
    /** Persist one field and return the resolved section. */
    updateSettings(update: HarnessCallSettingsUpdate): Promise<HarnessCallSettings>;
}
