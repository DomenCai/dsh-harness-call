# dsh-harness-call

在 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（DSH）里把工作委托给外部 coding agent——**Claude Code**、**Codex CLI**、**Grok CLI**。

一个面向模型的 `harness_call` 工具、`@claude` / `@codex` / `@grok` 输入框提及、带思考/工具调用时间线的实时进度卡片，以及详情侧栏；所有 harness 都被翻译成同一套规范化事件模型，新增一个 CLI 只动 host 侧。

## 功能

- **`harness_call` 工具** —— agent 用自包含的 prompt 调用任意外部 harness，拿回最终回复、有界的过程摘要（最近 40 条事件，每条一行），以及指向完整结构化时间线的 `runId`。
- **`@harness` 提及** —— 输入框打 `@` 即可选 `@claude` / `@codex` / `@grok`。提及是意图标记而非命令语法：提及绑定它后面的问题，`@claude @codex 各自怎么看 X` 是同一个问题发两家，`@claude 看看这个日志 @codex 写个测试` 是两个不同的 prompt。裸标签时回车会被吞掉，标签和你正在输入的问题保持同一行。
- **规范化事件模型** —— 每个 adapter 把自家 CLI 的原生 JSONL 翻译成同一个 `HarnessEvent` 联合类型（`session` / `reasoning` / `text` / `tool` / `file` / `error` / `usage` / `note`）；存储、卡片、面板讲同一种语言，新增 harness 无需改渲染。
- **按 `runId` 键控的运行表** —— host 不再是「每个 harness 一份快照」，而是一张运行表：同一个 harness 并发多次调用互不覆盖。卡片凭工具 `callId` 找到属于自己的那次运行，找不到才回退到该 harness 最新的一次。
- **增量拉取** —— 浏览器侧调 `get(runId, sinceSeq)`，只取游标之后的新事件；整页共用一个 2s 轮询器，没有进行中的调用时完全停轮询。
- **过程时间线** —— 点击卡片打开浮动面板：已结束的运行默认折叠过程列表（进行中则展开），思考文本弱化显示，工具调用带退出码并可展开看**完整入参**，费用/轮次在页脚。
- **不静默截断** —— 单次运行的环形缓冲淘汰事件时，淘汰条数以 `droppedEvents` 上报，面板明确提示时间线从中途开始。
- **会话自动续接** —— 每个 harness 默认续接自己最近一次**成功**的会话，多轮追问天然共享上下文；`newSession` / `sessionId` 可覆盖。
- **adapter 架构** —— 一个 harness 就是 [`src/host/adapters/`](src/host/adapters) 下的一个 adapter（`build` 构参 / `translate` 翻译事件 / `finalize` 归类结果）；运行身份、序号、相对时间戳和保留策略归存储，不归 adapter。

## 环境要求

- 带 web GUI 的 DSH（`web` profile）
- Node.js >= 20
- PATH 上至少装好并登录了 `claude`、`codex`、`grok` 之一

## 安装

从 npm 装——版本固定：

```sh
dsh plugin --profile web add dsh-harness-call
```

或直接从 GitHub 装——跟随 `main`；构建产物 `lib/` 已提交进仓库，安装时无需构建：

```sh
dsh plugin --profile web add github:DomenCai/dsh-harness-call
```

`dsh plugin` 会在 profile 目录里转发给 pnpm，装完自动校准 `dsh.profile.bundles`。本包声明了 `dsh.bundle`，因此会自动加入 profile 的层栈——不用手改 `package.json`。重启 DSH 并硬刷新 web GUI：`@` 菜单出现 harness 分组，agent 侧出现 `harness_call` 工具。

## 用法

直接对话即可：

- `@claude 帮我看看这个目录里有什么` —— 该问题委托给 Claude Code
- `@claude @codex 各自怎么看这个架构方案` —— 同一问题发两家，回复做汇总
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` —— 两个不同的 prompt

也可以自然语言：「让 Claude 看看这个问题」「对比一下 codex 和 grok 的回答」。

## 配置

三个配置项都是 host 内存运行表的保留上界。在 profile 自己的补丁层 `~/.dsh/profiles/web/cordis.patch.yml` 里覆盖：

```yaml
- id: dsh-harness-call
  config:
    maxEventsPerRun: 400         # 单次运行保留的事件数，超出由环形缓冲淘汰
    maxRuns: 50                  # 保留的运行数，超出丢弃最早那次已结束的运行
    promptPreviewCharacters: 280 # 卡片预览行保留的 prompt 字符数
```

上面写的就是默认值；不需要改的键留空即用默认。

## 安全边界

- **codex** 默认 `read-only` 沙箱；只有你在对话中明确授权才会传 `workspace-write`，且仅对新会话生效——续接的会话保持它创建时的沙箱与可写根目录。
- **claude** 使用自己的凭证存储：`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 会从子进程环境中**移除**（是移除，不是置空），宿主注入的网关凭证不会流到它那里。
- **grok** 固定传 `--reasoning-effort high`，避免 `~/.grok/config.toml` 里 TUI 的 `default_reasoning_effort = "xhigh"` 泄漏进一次性委托。
- 永远不向任何 CLI 传绕过权限的标志。
- 每次运行都有硬超时（默认 900s，收敛到 60–3600），到期或取消时整棵进程树被终止——先 SIGTERM，10s 宽限后 SIGKILL。

## 新增一个 harness

一个 adapter、一条名册、一行文案。UI 零改动——它只认规范化事件。

1. `src/host/adapters/<key>.ts` —— 实现 `HarnessAdapter<S>`，接口定义在 [`src/host/adapter.ts`](src/host/adapter.ts)：

```ts
export const myAdapter: HarnessAdapter<MyState> = {
  key: 'myagent',
  label: 'My Agent',
  bin: 'myagent',
  createState() { return { text: '', errorItems: [] } },        // 该 adapter 私有的折叠状态
  build(req) { return { argv, stdin, env } },                    // spawn 参数；env 值为 `undefined` 表示删除继承来的变量
  translate(native, state) { return [/* HarnessEvent[] */] },    // 一行原生 JSONL → 0..n 条规范化事件
  finalize(state, outcome, info) { return { ok, text, sessionId, errors, extras } },
}
```

   `translate` 只做翻译——不截断、不编号、不打时间戳、不做展示决策。`seq`、相对时间 `at`、环形缓冲和 `droppedEvents` 都归 [`src/host/runs.ts`](src/host/runs.ts) 的 `RunStore`。

2. `src/host/adapters/index.ts` —— 加进 `ADAPTERS`。
3. `src/shared/harness.ts` —— 把 key 加进 `HARNESS_KEYS` 并补 label；工具的 `harness` 枚举和输入框提及列表都由此派生。
4. `src/client/locales.ts` —— 每个语言补一条 `cand.<key>` 文案，即提及项的说明。

registry（对 `HarnessKey` 完备）和语言字典都由编译器把关，漏一步是构建报错，而不是运行时才暴露。

## 许可证

[MIT](LICENSE)
