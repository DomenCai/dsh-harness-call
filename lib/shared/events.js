/**
 * Normalized run/event contract shared by the host and browser halves.
 *
 * ZERO RUNTIME DEPENDENCIES BY DESIGN. This file is compiled by both tsc
 * programs (host and client). Importing any `@deepseek-ai` package here would
 * drag that package's `declare module '@deepseek-ai/cordis'` augmentation into
 * whichever program picks it up, and the host and browser runtimes merge
 * different members onto the same `Context` — so the two programs would start
 * disagreeing about a type neither of them declared. Pure types and
 * dependency-free constants only.
 *
 * @module dsh-harness-call/shared/events
 */
export {};
