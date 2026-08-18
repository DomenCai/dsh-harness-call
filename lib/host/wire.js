/**
 * The host face of the Remote contract: the Typert manifest.
 *
 * The invocation descriptors themselves live in ../shared/wire.ts and are
 * shared verbatim with the browser. Only the parts the browser must never see
 * stay here: the package reflection model, and the nominal protocol types that
 * would otherwise pull a Cordis `Context` augmentation into the client tsc
 * program.
 *
 * Annotating the manifest as `TypertContribution` is what makes the shared
 * literal safe — it is where the compiler checks the descriptors against the
 * real `InvocationDescriptor`, so a typo in the shared constant fails the host
 * build instead of the browser at runtime.
 *
 * @module dsh-harness-call/host/wire
 */
import { HARNESS_CALL_DESCRIPTORS, PACKAGE_NAME, SERVICE_KEY, } from "../shared/wire.js";
const remoteOutcomeMirrorsProtocol = true;
void remoteOutcomeMirrorsProtocol;
/** The host contribution registered through `ctx.typert.register`. */
export const HARNESS_CALL_MANIFEST = {
    package: PACKAGE_NAME,
    face: 'host',
    schemas: [],
    model: {
        services: [
            {
                key: SERVICE_KEY,
                exportName: 'HarnessCallRemoteService',
                description: 'Live harness run snapshots for the conversation cards and the details panel.',
                tags: [],
                members: [
                    {
                        kind: 'method',
                        name: 'list',
                        signature: 'list(): Promise<RunSummary[]>',
                    },
                    {
                        kind: 'method',
                        name: 'get',
                        signature: 'get(runId: string, sinceSeq: number): Promise<RunDetail | null>',
                    },
                    {
                        kind: 'method',
                        name: 'getSettings',
                        signature: 'getSettings(): Promise<HarnessCallSettings>',
                    },
                    {
                        kind: 'method',
                        name: 'updateSettings',
                        signature: 'updateSettings(update: HarnessCallSettingsUpdate): Promise<HarnessCallSettings>',
                    },
                ],
                types: [],
            },
        ],
        events: [],
        objects: [],
    },
    invocations: HARNESS_CALL_DESCRIPTORS,
};
