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
/** npm package name; the Typert contribution and bundle identity. */
export const PACKAGE_NAME = 'dsh-harness-call';
/** Cordis service key and Remote wire namespace. */
export const SERVICE_KEY = 'harnessCall';
/**
 * Invocation descriptors for every {@link HarnessCallRemote} method.
 *
 * Both parameters and results use the `src-json` codec: the payloads are the
 * plain-JSON contract types in ./events.ts, so there is no strict schema
 * symbol to register.
 */
export const HARNESS_CALL_DESCRIPTORS = [
    {
        id: `${PACKAGE_NAME}#${SERVICE_KEY}/list`,
        service: SERVICE_KEY,
        namespace: SERVICE_KEY,
        method: 'list',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'src-json' },
    },
    {
        id: `${PACKAGE_NAME}#${SERVICE_KEY}/get`,
        service: SERVICE_KEY,
        namespace: SERVICE_KEY,
        method: 'get',
        invocation: { kind: 'direct' },
        parameters: [
            { name: 'runId', wire: 'runId', source: 'json', codec: { mode: 'src-json' } },
            { name: 'sinceSeq', wire: 'sinceSeq', source: 'json', codec: { mode: 'src-json' } },
        ],
        result: { mode: 'src-json' },
    },
];
/**
 * The contribution the browser mounts through `ctx.remote.$mount`. Structurally
 * a `TypertRemoteContribution`; typed nominally only on the host side.
 */
export const HARNESS_CALL_CONTRIBUTION = {
    package: PACKAGE_NAME,
    descriptors: HARNESS_CALL_DESCRIPTORS,
};
