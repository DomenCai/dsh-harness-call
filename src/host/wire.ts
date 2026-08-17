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

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Value-type import: also merges `register`/`get`/`resolve` onto `ctx.typert`.
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import {
  HARNESS_CALL_DESCRIPTORS,
  PACKAGE_NAME,
  SERVICE_KEY,
  type RemoteOutcome,
} from '../shared/wire.ts'

/**
 * Compile-time proof that the shared, dependency-free {@link RemoteOutcome}
 * still mirrors the protocol's `RemoteResult` in both directions. The browser
 * calls Remote methods through the shared mirror because it cannot import the
 * real type; if the protocol ever changes shape, this fails the host build
 * rather than letting the browser mis-read every response.
 */
type MirrorsRemoteResult =
  RemoteOutcome<unknown> extends RemoteResult<unknown>
    ? RemoteResult<unknown> extends RemoteOutcome<unknown> ? true : never
    : never
const remoteOutcomeMirrorsProtocol: MirrorsRemoteResult = true
void remoteOutcomeMirrorsProtocol

/** The host contribution registered through `ctx.typert.register`. */
export const HARNESS_CALL_MANIFEST: TypertContribution = {
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
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: HARNESS_CALL_DESCRIPTORS,
}
