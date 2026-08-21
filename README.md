# dsh-harness-call

Delegate work to external coding agents — **Claude Code**, **Codex CLI**, **Grok CLI**, **Kimi CLI** — from inside [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (DSH).

One model-facing `harness_call` tool, `@claude` / `@codex` / `@grok` / `@kimi` composer mentions, live progress cards with a thinking/tool-call timeline, and a details side panel — with every harness translated into one normalized event model, so adding another CLI is a host-side change only.

## Features

- **`harness_call` tool** — the agent calls any installed harness with a self-contained prompt. Successful calls return the authoritative final reply and a `runId`; failed or empty-reply calls additionally include a filtered diagnostic tail of at most 15 non-text events.
- **`@harness` mentions** — type `@` in the composer to pick `@claude` / `@codex` / `@grok` / `@kimi`. A mention is an intent marker, not command syntax: mentions bind to the question that follows them, so `@claude @codex what do you think of X` sends the same question to both, while `@claude review this log @codex write a test` sends two different prompts. Enter on a bare mention is swallowed so the tag stays on one line while you type.
- **Normalized event model** — each adapter translates its CLI's native JSONL into one `HarnessEvent` union (`session` / `reasoning` / `text` / `tool_start` / `tool_finish` / `file` / `error` / `usage` / `note`). Tool failure is distinct from a real process exit code; `file` remains Codex-only protocol evidence.
- **Runs keyed by `runId`** — the host keeps a run table, not one snapshot per harness: several calls to the same harness run concurrently without overwriting each other. A card finds its own run by the tool `callId`, falling back to the newest run of that harness.
- **Incremental polling** — the browser asks `get(runId, sinceSeq)` and receives only the events after its cursor; one shared poller (2s) serves every card on the page and stops entirely once no call is live.
- **Chronological transcript** — clicking a card opens prompt → process segment → assistant text → process segment in the order it happened. Assistant text is shown once and stays expanded; each consecutive non-text segment has its own disclosure, with only the live tail auto-opened. Real exit codes appear only when the harness reports one.
- **No silent truncation** — when a run's ring buffer evicts, the count is reported as `droppedEvents`; the panel says the transcript starts mid-run and appends the adapter's authoritative full reply.
- **Session auto-continue** — each harness continues its own most recent *successful* session by default, so multi-turn follow-ups share context; `newSession` / `sessionId` override. Independent `harness_call`s run in parallel. If two calls target the same harness at once, only the first auto-continues; the rest open a fresh session so they do not share a live CLI conversation.
- **Adapter architecture** — one harness is one adapter (`build` argv / `translate` events / `finalize` verdict) under [`src/host/adapters/`](src/host/adapters); run identity, sequence numbers, relative timestamps and retention belong to the store, not to the adapters.

## Requirements

- DSH with the web GUI (profile `web`)
- Node.js >= 20
- At least one of the CLIs installed and authenticated on PATH: `claude`, `codex`, `grok`, or `kimi`

## Install

Recommended — install the pinned release from npm:

```sh
dsh plugin --profile web add dsh-harness-call
```

Optional — install straight from GitHub to track `main`:

```sh
dsh plugin --profile web add github:DomenCai/dsh-harness-call
```

GitHub source installs are slower and less predictable than npm releases because build artifacts are not committed: pnpm must run the `prepare` script on the installing machine, which requires Node ≥ 20 and pnpm. If pnpm reports that the Git-hosted dependency's build script was blocked, add the exact package key printed by pnpm under `allowBuilds` in `~/.dsh/profiles/web/pnpm-workspace.yaml`, then rerun the command.

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles `dsh.profile.bundles` itself. This package declares `dsh.bundle`, so it joins the profile's layer stack automatically — no manual `package.json` edit. Restart DSH and hard-refresh the web GUI: the `@` menu gains the harness group and the agent sees the `harness_call` tool.

## Usage

Just talk to the agent:

- `@claude 帮我看看这个目录里有什么` — delegates that question to Claude Code
- `@claude @codex 各自怎么看这个架构方案` — same question to both, replies synthesized
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` — two different prompts

Or ask naturally: “让 Claude 看看这个问题”, “对比一下 codex 和 grok 的回答”.

## Settings

**Settings → External harnesses** has one card per CLI:

- **Access**: read-only, workspace-write, full access, or **Model decides**
- **Reasoning effort**: low / medium / high / xhigh, or **Model decides** (Kimi's vocabulary is low / high / max; its select offers only those)

A concrete value is applied on the next launch and the tool arguments cannot override it. **Model decides** is the only case that reads this call's `access` / `effort`; when neither side names a value, that CLI's own configured default applies.

Defaults: all four harnesses leave both fields to the model. A process that is already running keeps its original flags. Codex / Grok sandbox flags apply to **new** sessions only; a resume keeps the profile it was created with. Kimi's headless mode has no permission switch, so its **Access** field is disabled on the settings page.

The top of the settings page also has an opt-in **Raw log capture** switch, off by default. Each file starts with `captureVersion: 1` and contains the complete prompt, deduplicated spawn arguments, raw stdout JSONL lines, stderr, normalized events linked by `sourceSeq`, exit facts, and the final verdict. Environment tombstones are recorded as `null`; credential-shaped values that actually exist are `[REDACTED]`. The default directory is `~/.dsh/harness-call/logs`. Capture files are automatically rotated by `rawLogFiles`, active files are never deleted, and ordinary records stop at `rawLogBytes`; a truncated file ends with bounded `capture.truncated` and `capture.end` records outside that byte budget. Logs may still contain source code and other sensitive information.

## Configuration

These five settings bound the host's in-memory run store and optional raw-log capture. Override them in the profile's own patch layer, `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: dsh-harness-call
  config:
    maxEventsPerRun: 400         # events kept per run before the ring buffer evicts
    maxRuns: 50                  # runs kept before the oldest finished one is dropped
    promptPreviewCharacters: 280 # prompt characters kept for a card's preview line
    rawLogFiles: 200              # retained NDJSON files, including active captures
    rawLogBytes: 33554432         # ordinary-record bytes per file (32 MiB); terminal markers are extra
```

The values above are the defaults; omit a key to keep its default.

## Security posture

- **Access** comes from Settings. Full access maps onto each CLI's widest headless mode (Claude `bypassPermissions`, Codex `danger-full-access` plus approval bypass, Grok `off` plus `bypassPermissions`) — only turn it on in a trusted environment.
- **codex** still defaults a new session to `read-only` when Settings is “Model decides” and the tool did not pass `access`. A resumed session keeps the sandbox and writable roots it was created with.
- **claude** runs on its own credential store: `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` are *removed* from the child environment (removed, not blanked), so host-injected gateway credentials never reach it. It has no OS sandbox flag: `read-only` is `--permission-mode dontAsk` plus a built-in tool allowlist (`Read`, `Glob`, `Grep`, `WebFetch`, `WebSearch`), not an OS sandbox. `workspace-write` maps to `acceptEdits`, `full-access` to `bypassPermissions`.
- **kimi** has no permission switch in headless mode (`-p` cannot combine with `--yolo` / `--auto` / `--plan`), so a run always inherits `default_permission_mode` from `~/.kimi-code/config.toml` — the plugin never rewrites that config; make sure it matches your expectation.
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
3. `src/shared/harness.ts` — add the key, label, and a `HARNESS_SESSION_NAMING` verdict (`caller` or `harness`); the tool enum and mention list derive from the roster.
4. `src/shared/policy.ts` — add a defaults row to `defaultHarnessCallSettings()` and declare which knobs the CLI honors in `HARNESS_CAPABILITIES` (an unsupported field is disabled on the settings page).
5. `src/host/settings.ts` — add one persistence row to `HarnessCallSettingsSchema`.
6. `src/client/locales.ts` — one `cand.<key>` line per locale, the mention's description.

The registry, the settings schema, the capability table (all typed total over `HarnessKey`) and the locale dictionaries are compiler-enforced, so a missed step is a build error rather than a runtime surprise.

Before changing the event model, the store or the panel, read [`docs/architecture.md`](docs/architecture.md) — it records the invariants that are easy to break, the places where harness protocols are genuinely unequal, and the designs that were already argued down. Deferred work lives in [`docs/backlog.md`](docs/backlog.md).

## License

[MIT](LICENSE)
