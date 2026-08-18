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
 * A Client `$mount` gate that accepts only `mode: 'strict'`. Official packages
 * fill this with `dsh-typert-generator` + Zod; this plugin's payloads are the
 * already-JSON types in ./events.ts, so the schema is identity. Host Gateway
 * still runs `assertJsonValue` after parse.
 *
 * Kept free of `@deepseek-ai` imports so the browser bundle can inline this
 * module without tripping the client-bundle purity gate.
 */
function identityCodec(typeSymbol) {
    return {
        mode: 'strict',
        typeSymbol,
        schema: { parse: (value) => value },
    };
}
const RUN_ID_CODEC = identityCodec(`${PACKAGE_NAME}#runId`);
const SINCE_SEQ_CODEC = identityCodec(`${PACKAGE_NAME}#sinceSeq`);
const RUN_SUMMARIES_CODEC = identityCodec(`${PACKAGE_NAME}#RunSummary[]`);
const RUN_DETAIL_CODEC = identityCodec(`${PACKAGE_NAME}#RunDetail`);
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
];
/**
 * The contribution the browser mounts through `ctx.remote.$mount`. Structurally
 * a `TypertRemoteContribution`; typed nominally only on the host side.
 */
export const HARNESS_CALL_CONTRIBUTION = {
    package: PACKAGE_NAME,
    descriptors: HARNESS_CALL_DESCRIPTORS,
};
