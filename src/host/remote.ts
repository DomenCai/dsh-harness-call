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

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RunDetail, RunSummary } from '../shared/events.js'
import type { HarnessCallSettings, HarnessCallSettingsUpdate } from '../shared/policy.js'
import { SERVICE_KEY, type HarnessCallRemote } from '../shared/wire.js'
import type { RunStore } from './runs.js'

export class HarnessCallRemoteService extends TypertRemoteService implements HarnessCallRemote {
  private readonly runs: RunStore
  private readonly readSettings: () => HarnessCallSettings
  private readonly writeSettings: (update: HarnessCallSettingsUpdate) => Promise<HarnessCallSettings>

  constructor(
    ctx: Context,
    runs: RunStore,
    readSettings: () => HarnessCallSettings,
    writeSettings: (update: HarnessCallSettingsUpdate) => Promise<HarnessCallSettings>,
  ) {
    super(ctx, SERVICE_KEY)
    this.runs = runs
    this.readSettings = readSettings
    this.writeSettings = writeSettings
  }

  /** Every known run, newest `startedAt` first. */
  @Remote
  async list(): Promise<RunSummary[]> {
    return this.runs.list()
  }

  /**
   * One run's summary plus the events after `sinceSeq`.
   * @param runId - run identity from a {@link RunSummary}.
   * @param sinceSeq - highest `seq` the caller already holds.
   * @returns the detail, or `null` when the run id is unknown.
   */
  @Remote
  async get(runId: string, sinceSeq: number): Promise<RunDetail | null> {
    return this.runs.get(runId, sinceSeq)
  }

  /** Current per-harness access / effort settings. */
  @Remote
  async getSettings(): Promise<HarnessCallSettings> {
    return this.readSettings()
  }

  /** Persist one field and return the resolved section. */
  @Remote
  async updateSettings(update: HarnessCallSettingsUpdate): Promise<HarnessCallSettings> {
    return this.writeSettings(update)
  }
}
