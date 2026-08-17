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
import type { RunDetail, RunSummary } from './events.ts';
/** npm package name; the Typert contribution and bundle identity. */
export declare const PACKAGE_NAME = "dsh-harness-call";
/** Cordis service key and Remote wire namespace. */
export declare const SERVICE_KEY = "harnessCall";
/**
 * Host methods exposed over Remote.
 *
 * `list` is the roster poll and deliberately carries no events: a session can
 * accumulate many runs and only the focused one needs a timeline. `get` is the
 * incremental poll for the focused run.
 */
export interface HarnessCallRemote {
    /** Every known run, newest `startedAt` first. */
    list(): Promise<RunSummary[]>;
    /**
     * One run's summary plus the events after `sinceSeq`.
     * @param runId - run identity from a {@link RunSummary}.
     * @param sinceSeq - highest `seq` already held; `0` requests everything retained.
     * @returns the detail, or `null` when the run id is unknown.
     */
    get(runId: string, sinceSeq: number): Promise<RunDetail | null>;
}
/**
 * Structural mirror of the Typert protocol's `RemoteResult<T>`: what a Remote
 * call resolves to on the browser side, where carrier failures are folded into
 * the value instead of rejecting. Restated locally because importing the real
 * type would pull the protocol package's Cordis augmentation into the client
 * program; `src/host/wire.ts` asserts the two stay identical.
 */
export type RemoteOutcome<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details: object;
    };
};
/**
 * The `harnessCall` namespace as the browser sees it: the same methods as
 * {@link HarnessCallRemote}, each resolving to a {@link RemoteOutcome} instead
 * of throwing. Derived rather than restated so a signature change cannot land
 * on one face only.
 */
export type HarnessCallRemoteClient = {
    [Method in keyof HarnessCallRemote]: (...args: Parameters<HarnessCallRemote[Method]>) => Promise<RemoteOutcome<Awaited<ReturnType<HarnessCallRemote[Method]>>>>;
};
/**
 * Invocation descriptors for every {@link HarnessCallRemote} method.
 *
 * Both parameters and results use the `src-json` codec: the payloads are the
 * plain-JSON contract types in ./events.ts, so there is no strict schema
 * symbol to register.
 */
export declare const HARNESS_CALL_DESCRIPTORS: readonly [{
    readonly id: "dsh-harness-call#harnessCall/list";
    readonly service: "harnessCall";
    readonly namespace: "harnessCall";
    readonly method: "list";
    readonly invocation: {
        readonly kind: "direct";
    };
    readonly parameters: readonly [];
    readonly result: {
        readonly mode: "src-json";
    };
}, {
    readonly id: "dsh-harness-call#harnessCall/get";
    readonly service: "harnessCall";
    readonly namespace: "harnessCall";
    readonly method: "get";
    readonly invocation: {
        readonly kind: "direct";
    };
    readonly parameters: readonly [{
        readonly name: "runId";
        readonly wire: "runId";
        readonly source: "json";
        readonly codec: {
            readonly mode: "src-json";
        };
    }, {
        readonly name: "sinceSeq";
        readonly wire: "sinceSeq";
        readonly source: "json";
        readonly codec: {
            readonly mode: "src-json";
        };
    }];
    readonly result: {
        readonly mode: "src-json";
    };
}];
/**
 * The contribution the browser mounts through `ctx.remote.$mount`. Structurally
 * a `TypertRemoteContribution`; typed nominally only on the host side.
 */
export declare const HARNESS_CALL_CONTRIBUTION: {
    readonly package: "dsh-harness-call";
    readonly descriptors: readonly [{
        readonly id: "dsh-harness-call#harnessCall/list";
        readonly service: "harnessCall";
        readonly namespace: "harnessCall";
        readonly method: "list";
        readonly invocation: {
            readonly kind: "direct";
        };
        readonly parameters: readonly [];
        readonly result: {
            readonly mode: "src-json";
        };
    }, {
        readonly id: "dsh-harness-call#harnessCall/get";
        readonly service: "harnessCall";
        readonly namespace: "harnessCall";
        readonly method: "get";
        readonly invocation: {
            readonly kind: "direct";
        };
        readonly parameters: readonly [{
            readonly name: "runId";
            readonly wire: "runId";
            readonly source: "json";
            readonly codec: {
                readonly mode: "src-json";
            };
        }, {
            readonly name: "sinceSeq";
            readonly wire: "sinceSeq";
            readonly source: "json";
            readonly codec: {
                readonly mode: "src-json";
            };
        }];
        readonly result: {
            readonly mode: "src-json";
        };
    }];
};
