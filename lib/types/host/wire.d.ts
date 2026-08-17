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
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
/** The host contribution registered through `ctx.typert.register`. */
export declare const HARNESS_CALL_MANIFEST: TypertContribution;
