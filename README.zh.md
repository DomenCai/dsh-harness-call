# dsh-harness-call

在 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（DSH）里把工作委托给外部 coding agent——**Claude Code**、**Codex CLI**、**Grok CLI**。

一个面向模型的 `harness_call` 工具、`@claude` / `@codex` / `@grok` 输入框提及、带思考/工具调用时间线的实时进度卡片，以及详情侧栏；adapter 架构让新增一个 CLI 只需改一个文件。

## 功能

- **`harness_call` 工具** —— agent 用自包含的 prompt 调用任意外部 harness，拿回最终回复和过程摘要（思考、工具调用、错误）。
- **`@harness` 提及** —— 输入框打 `@` 即可选 `@claude` / `@codex` / `@grok`。提及是意图标记而非命令语法：提及绑定它后面的问题，`@claude @codex 各自怎么看 X` 是同一个问题发两家，`@claude 看看这个日志 @codex 写个测试` 是两个不同的 prompt。裸标签时回车会被吞掉，标签和你正在输入的问题保持同一行。
- **实时进度卡片** —— 运行中显示已运行时间、原生事件数、产出字符数、session id，从 Host 实时轮询。
- **过程时间线** —— 点击卡片在 DSH 详情列打开完整过程：💭 思考、🔧 工具调用（含命令行和退出码）、📄 文本产出、⚠ 错误，每条带相对时间戳。
- **会话自动续接** —— 每个 harness 默认续接自己最近一次会话，多轮追问天然共享上下文；`newSession` / `sessionId` 可覆盖。
- **adapter 架构** —— 每个 harness 是 [`src/adapters.js`](src/adapters.js) 里的一个 adapter 对象（`build` 构参 / `onEvent` 折叠事件 / `finalize` 归类结果），编排层完全通用。

## 环境要求

- 带_web_ GUI 的 DSH（`web` profile）
- PATH 上至少装好并登录了 `claude`、`codex`、`grok` 之一

## 安装

在 DSH profile 目录（`$DSH_HOME/profiles/web`，通常是 `~/.dsh/profiles/web`）：

```bash
corepack pnpm add github:YOUR_GITHUB_OWNER/dsh-harness-call
```

再把包加进 profile `package.json` 的 `dsh.profile.bundles`：

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

刷新 web GUI —— `@` 菜单出现 harness 分组，agent 侧出现 `harness_call` 工具。

## 用法

直接对话即可：

- `@claude 帮我看看这个目录里有什么` —— 该问题委托给 Claude Code
- `@claude @codex 各自怎么看这个架构方案` —— 同一问题发两家，回复做汇总
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` —— 两个不同的 prompt

也可以自然语言：「让 Claude 看看这个问题」「对比一下 codex 和 grok 的回答」。

## 安全边界

- **codex** 默认 `read-only` 沙箱；只有你在对话中明确授权才会传 `workspace-write`。
- **claude** 使用自己的凭证存储——DSH 注入的 `ANTHROPIC_*` 网关凭证会从子进程环境中剥离。
- 永远不向任何 CLI 传绕过权限的标志。
- 每次运行都有硬超时（默认 900s，范围 60–3600），到期或取消时整棵进程树被终止。

## 新增一个 harness

在 `src/adapters.js` 的 `ADAPTERS` 里加一个条目：

```js
{
  bin: 'myagent',
  build(req) { return { argv, stdin, env } },     // spawn 参数
  onEvent(event, state, digest) {},               // 折叠原生 JSONL 事件
  finalize(state, outcome, info) { return { ok, text, sessionId, errors, extras } },
}
```

再把它的 key 加进工具的 `harness` 枚举（`src/index.js`）、`LABELS`，以及 client 的 `HARNESS_INFO` 列表（`src/client.js`）。其他都不用动。

## 许可证

[MIT](LICENSE)
