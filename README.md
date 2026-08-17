# dsh-harness-call

Delegate work to external coding agents — **Claude Code**, **Codex CLI**, **Grok CLI** — from inside [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (DSH).

One model-facing `harness_call` tool, `@claude` / `@codex` / `@grok` composer mentions, live progress cards with a thinking/tool-call timeline, and a details side panel — with every harness translated into one normalized event model, so adding another CLI is a host-side change only.

## Features

- **`harness_call` tool** — the agent calls any installed harness with a self-contained prompt and gets back the final reply, a bounded process digest (the last 40 events, one line each), and a `runId` handle to the full structured timeline.
- **`@harness` mentions** — type `@` in the composer to pick `@claude` / `@codex` / `@grok`. A mention is an intent marker, not command syntax: mentions bind to the question that follows them, so `@claude @codex what do you think of X` sends the same question to both, while `@claude review this log @codex write a test` sends two different prompts. Enter on a bare mention is swallowed so the tag stays on one line while you type.
- **Normalized event model** — each adapter translates its CLI's native JSONL into one `HarnessEvent` union (`session` / `reasoning` / `text` / `tool` / `file` / `error` / `usage` / `note`), so the store, the cards and the panel all speak one language and a new harness needs no rendering change.
- **Runs keyed by `runId`** — the host keeps a run table, not one snapshot per harness: several calls to the same harness run concurrently without overwriting each other. A card finds its own run by the tool `callId`, falling back to the newest run of that harness.
- **Incremental polling** — the browser asks `get(runId, sinceSeq)` and receives only the events after its cursor; one shared poller (2s) serves every card on the page and stops entirely once no call is live.
- **Process timeline** — clicking a card opens the DSH details column: reasoning de-emphasized, tool calls with exit code and their **complete** arguments behind a disclosure, file changes, errors, and cost/turn accounting in the footer — each row with a relative timestamp.
- **No silent truncation** — when a run's ring buffer evicts, the count is reported as `droppedEvents` and the panel says the timeline starts mid-run.
- **Session auto-continue** — each harness continues its own most recent *successful* session by default, so multi-turn follow-ups share context; `newSession` / `sessionId` override.
- **Adapter architecture** — one harness is one adapter (`build` argv / `translate` events / `finalize` verdict) under [`src/host/adapters/`](src/host/adapters); run identity, sequence numbers, relative timestamps and retention belong to the store, not to the adapters.

## Requirements

- DSH with the web GUI (profile `web`)
- Node.js >= 20
- At least one of the CLIs installed and authenticated on PATH: `claude`, `codex`, or `grok`

## Install

From npm — pinned releases:

```sh
dsh plugin --profile web add dsh-harness-call
```

Or straight from GitHub — tracks `main`; the built `lib/` is committed, so nothing has to build on install:

```sh
dsh plugin --profile web add github:DomenCai/dsh-harness-call
```

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles `dsh.profile.bundles` itself. This package declares `dsh.bundle`, so it joins the profile's layer stack automatically — no manual `package.json` edit. Restart DSH and hard-refresh the web GUI: the `@` menu gains the harness group and the agent sees the `harness_call` tool.

## Usage

Just talk to the agent:

- `@claude 帮我看看这个目录里有什么` — delegates that question to Claude Code
- `@claude @codex 各自怎么看这个架构方案` — same question to both, replies synthesized
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` — two different prompts

Or ask naturally: “让 Claude 看看这个问题”, “对比一下 codex 和 grok 的回答”.

## Configuration

All three settings are retention bounds on the host's in-memory run store. Override them in the profile's own patch layer, `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: dsh-harness-call
  config:
    maxEventsPerRun: 400         # events kept per run before the ring buffer evicts
    maxRuns: 50                  # runs kept before the oldest finished one is dropped
    promptPreviewCharacters: 280 # prompt characters kept for a card's preview line
```

The values above are the defaults; omit a key to keep its default.

## Security posture

- **codex** defaults to a `read-only` sandbox; `workspace-write` is only passed when you explicitly authorize it in the conversation, and only for a new session — a resumed session keeps the sandbox and writable roots it was created with.
- **claude** runs on its own credential store: `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` are *removed* from the child environment (removed, not blanked), so host-injected gateway credentials never reach it.
- Permission-bypass flags are never passed to any CLI.
- Every run has a hard timeout (default 900s, clamped to 60–3600) and is terminated tree-wide on expiry or cancellation — SIGTERM, then SIGKILL after a 10s grace window.

## Adding a harness

One adapter, one roster entry, one line of copy. The UI is untouched: it only knows normalized events.

1. `src/host/adapters/<key>.ts` — implement `HarnessAdapter<S>`; the contract lives in [`src/host/adapter.ts`](src/host/adapter.ts):

```ts
export const myAdapter: HarnessAdapter<MyState> = {
  key: 'myagent',
  label: 'My Agent',
  bin: 'myagent',
  createState() { return { text: '', errorItems: [] } },        // this adapter's private fold state
  build(req) { return { argv, stdin, env } },                    // spawn spec; an `undefined` env value REMOVES an inherited variable
  translate(native, state) { return [/* HarnessEvent[] */] },    // one native JSONL line → 0..n normalized events
  finalize(state, outcome, info) { return { ok, text, sessionId, errors, extras } },
}
```

   `translate` is translation only — no truncation, no sequence numbers, no timestamps, no display decisions. `seq`, the relative `at`, the ring buffer and `droppedEvents` belong to `RunStore` in [`src/host/runs.ts`](src/host/runs.ts).

2. `src/host/adapters/index.ts` — add it to `ADAPTERS`.
3. `src/shared/harness.ts` — add the key to `HARNESS_KEYS` and its label; the tool's `harness` enum and the composer's mention list both derive from there.
4. `src/client/locales.ts` — one `cand.<key>` line per locale, the mention's description.

Both the registry (typed total over `HarnessKey`) and the locale dictionaries are compiler-enforced, so a missed step is a build error rather than a runtime surprise.

## License

[MIT](LICENSE)
