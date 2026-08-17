# dsh-harness-call

Delegate work to external coding agents — **Claude Code**, **Codex CLI**, **Grok CLI** — from inside [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (DSH).

One model-facing `harness_call` tool, `@claude` / `@codex` / `@grok` composer mentions, live progress cards with a thinking/tool-call timeline, and a details side panel — with an adapter architecture that makes adding another CLI a single-file change.

## Features

- **`harness_call` tool** — the agent calls any installed harness with a self-contained prompt and gets the final reply plus a process summary (thinking, tool calls, errors) back.
- **`@harness` mentions** — type `@` in the composer to pick `@claude` / `@codex` / `@grok`. A mention is an intent marker, not command syntax: mentions bind to the question that follows them, so `@claude @codex what do you think of X` sends the same question to both, while `@claude review this log @codex write a test` sends two different prompts. Enter on a bare mention is swallowed so the tag stays on one line while you type.
- **Live progress card** — elapsed time, native event count, growing output size, session id, polled live from the host.
- **Process timeline** — the card click opens the DSH details column with the full run: 💭 reasoning, 🔧 tool calls (with commands and exit codes), 📄 text output, ⚠ errors, each with a relative timestamp.
- **Session auto-continue** — each harness continues its own most recent session by default, so multi-turn follow-ups share context; `newSession` / `sessionId` override.
- **Adapter architecture** — every harness is one adapter object (`build` argv / `onEvent` fold / `finalize` classify) in [`src/adapters.js`](src/adapters.js); the orchestrator is generic.

## Requirements

- DSH with the web GUI (profile `web`)
- At least one of the CLIs installed and authenticated on PATH: `claude`, `codex`, or `grok`

## Install

In your DSH profile directory (`$DSH_HOME/profiles/web`, usually `~/.dsh/profiles/web`):

```bash
corepack pnpm add github:YOUR_GITHUB_OWNER/dsh-harness-call
```

Then add the package to `dsh.profile.bundles` in the profile's `package.json`:

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-harness-call"
    ]
  }
}
```

Reload the web GUI — the `@` menu gains the harness group and the agent sees the `harness_call` tool.

## Usage

Just talk to the agent:

- `@claude 帮我看看这个目录里有什么` — delegates that question to Claude Code
- `@claude @codex 各自怎么看这个架构方案` — same question to both, replies synthesized
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` — two different prompts

Or ask naturally: “让 Claude 看看这个问题”, “对比一下 codex 和 grok 的回答”.

## Security posture

- **codex** defaults to a `read-only` sandbox; `workspace-write` is only passed when you explicitly authorize it in the conversation.
- **claude** runs on its own credential store — DSH-injected `ANTHROPIC_*` gateway credentials are stripped from the child environment.
- Permission-bypass flags are never passed to any CLI.
- Every run has a hard timeout (default 900s, 60–3600) and is terminated tree-wide on expiry or cancellation.

## Adding a harness

Add one entry to `ADAPTERS` in `src/adapters.js` implementing:

```js
{
  bin: 'myagent',
  build(req) { return { argv, stdin, env } },     // spawn spec pieces
  onEvent(event, state, digest) {},               // fold native JSONL events
  finalize(state, outcome, info) { return { ok, text, sessionId, errors, extras } },
}
```

…plus its key in the tool's `harness` enum (`src/index.js`), `LABELS`, and the client's `HARNESS_INFO` list (`src/client.js`). Nothing else changes.

## License

[MIT](LICENSE)
