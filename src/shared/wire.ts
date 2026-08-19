/**
 * The Typert Remote contract for `harnessCall`, owned by both halves at once.
 *
 * The host publishes invocation descriptors in its Typert manifest and the
 * browser mounts descriptors to build the client namespace; the two must match
 * field for field. They used to be two hand-written literals in two files, and
 * an edit to one silently broke the other at runtime only. Here they are ONE
 * constant: `src/host/wire.ts` embeds it in the host manifest, `src/client`
 * mounts it directly.
 *
 * Zero runtime dependencies — see the note in ./events.ts. That is what lets a
 * value (not just a type) be shared: the browser bundle can inline this module
 * without tripping the client-bundle purity gate, because it pulls in no
 * `@deepseek-ai` package at all. `src/host/wire.ts` statically proves the
 * constant conforms to the real `InvocationDescriptor` type.
 *
 * @module dsh-harness-call/shared/wire
 */

import type { RunDetail, RunSummary } from './events.js'
import type { HarnessCallSettings, HarnessCallSettingsUpdate } from './policy.js'

/** npm package name; the Typert contribution and bundle identity. */
export const PACKAGE_NAME = 'dsh-harness-call'

/** Cordis service key and Remote wire namespace. */
export const SERVICE_KEY = 'harnessCall'

/**
 * Host methods exposed over Remote.
 *
 * `list` is the roster poll and deliberately carries no events: a session can
 * accumulate many runs and only the focused one needs a timeline. `get` is the
 * incremental poll for the focused run.
 */
export interface HarnessCallRemote {
  /** Every known run, newest `startedAt` first. */
  list(): Promise<RunSummary[]>
  /**
   * One run's summary plus the events after `sinceSeq`.
   * @param runId - run identity from a {@link RunSummary}.
   * @param sinceSeq - highest `seq` already held; `0` requests everything retained.
   * @returns the detail, or `null` when the run id is unknown.
   */
  get(runId: string, sinceSeq: number): Promise<RunDetail | null>
  /** Current per-harness access / effort settings. */
  getSettings(): Promise<HarnessCallSettings>
  /** Persist one field and return the resolved section. */
  updateSettings(update: HarnessCallSettingsUpdate): Promise<HarnessCallSettings>
}

/**
 * Structural mirror of the Typert protocol's `RemoteResult<T>`: what a Remote
 * call resolves to on the browser side, where carrier failures are folded into
 * the value instead of rejecting. Restated locally because importing the real
 * type would pull the protocol package's Cordis augmentation into the client
 * program; `src/host/wire.ts` asserts the two stay identical.
 */
export type RemoteOutcome<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string, readonly details: object } }

/**
 * The `harnessCall` namespace as the browser sees it: the same methods as
 * {@link HarnessCallRemote}, each resolving to a {@link RemoteOutcome} instead
 * of throwing. Derived rather than restated so a signature change cannot land
 * on one face only.
 */
export type HarnessCallRemoteClient = {
  [Method in keyof HarnessCallRemote]: (
    ...args: Parameters<HarnessCallRemote[Method]>
  ) => Promise<RemoteOutcome<Awaited<ReturnType<HarnessCallRemote[Method]>>>>
}

/**
 * A Client `$mount` gate that accepts only `mode: 'strict'`. Official packages
 * fill this with `dsh-typert-generator` + Zod; this plugin's payloads are the
 * already-JSON types in ./events.ts, so the schema is identity. Host Gateway
 * still runs `assertJsonValue` after parse.
 *
 * Kept free of `@deepseek-ai` imports so the browser bundle can inline this
 * module without tripping the client-bundle purity gate.
 */
function identityCodec(typeSymbol: string): {
  readonly mode: 'strict'
  readonly typeSymbol: string
  readonly schema: { parse: (value: unknown) => unknown }
} {
  return {
    mode: 'strict',
    typeSymbol,
    schema: { parse: (value: unknown) => value },
  }
}

const RUN_ID_CODEC = identityCodec(`${PACKAGE_NAME}#runId`)
const SINCE_SEQ_CODEC = identityCodec(`${PACKAGE_NAME}#sinceSeq`)
const RUN_SUMMARIES_CODEC = identityCodec(`${PACKAGE_NAME}#RunSummary[]`)
const RUN_DETAIL_CODEC = identityCodec(`${PACKAGE_NAME}#RunDetail`)
const SETTINGS_CODEC = identityCodec(`${PACKAGE_NAME}#HarnessCallSettings`)
const SETTINGS_UPDATE_CODEC = identityCodec(`${PACKAGE_NAME}#HarnessCallSettingsUpdate`)

/**
 * Invocation descriptors for every {@link HarnessCallRemote} method.
 *
 * Identity-strict codecs, not `src-json`: the Client Remote mount rejects any
 * descriptor whose result or parameters lack a generated-shaped strict codec.
 */
export const HARNESS_CALL_DESCRIPTORS = [
  {
    id: `${PACKAGE_NAME}#${SERVICE_KEY}/list`,
    service: SERVICE_KEY,
    namespace: SERVICE_KEY,
    method: 'list',
    invocation: { kind: 'direct' },
    parameters: [],
    result: RUN_SUMMARIES_CODEC,
  },
  {
    id: `${PACKAGE_NAME}#${SERVICE_KEY}/get`,
    service: SERVICE_KEY,
    namespace: SERVICE_KEY,
    method: 'get',
    invocation: { kind: 'direct' },
    parameters: [
      { name: 'runId', wire: 'runId', source: 'json', codec: RUN_ID_CODEC },
      { name: 'sinceSeq', wire: 'sinceSeq', source: 'json', codec: SINCE_SEQ_CODEC },
    ],
    result: RUN_DETAIL_CODEC,
  },
  {
    id: `${PACKAGE_NAME}#${SERVICE_KEY}/getSettings`,
    service: SERVICE_KEY,
    namespace: SERVICE_KEY,
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: SETTINGS_CODEC,
  },
  {
    id: `${PACKAGE_NAME}#${SERVICE_KEY}/updateSettings`,
    service: SERVICE_KEY,
    namespace: SERVICE_KEY,
    method: 'updateSettings',
    invocation: { kind: 'direct' },
    parameters: [
      { name: 'update', wire: 'update', source: 'json', codec: SETTINGS_UPDATE_CODEC },
    ],
    result: SETTINGS_CODEC,
  },
] as const

/**
 * The contribution the browser mounts through `ctx.remote.$mount`. Structurally
 * a `TypertRemoteContribution`; typed nominally only on the host side.
 */
export const HARNESS_CALL_CONTRIBUTION = {
  package: PACKAGE_NAME,
  descriptors: HARNESS_CALL_DESCRIPTORS,
} as const
