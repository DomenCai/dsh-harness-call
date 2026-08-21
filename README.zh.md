# dsh-harness-call

[English](README.md)

在 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（DSH）里把工作委托给外部 coding agent——**Claude Code**、**Codex CLI**、**Grok CLI**、**Kimi CLI**。

一个面向模型的 `harness_call` 工具、`@claude` / `@codex` / `@grok` / `@kimi` 输入框提及、带思考/工具调用时间线的实时进度卡片，以及详情侧栏；所有 harness 都被翻译成同一套规范化事件模型，新增一个 CLI 只动 host 侧。

## 功能

- **`harness_call` 工具** —— agent 用自包含的 prompt 调用任意外部 harness。成功只返回权威最终回复与 `runId`；失败或空回复时，额外附带最多 15 条、过滤掉文本/思考/用量的诊断尾巴。
- **`@harness` 提及** —— 输入框打 `@` 即可选 `@claude` / `@codex` / `@grok` / `@kimi`。提及是意图标记而非命令语法：提及绑定它后面的问题，`@claude @codex 各自怎么看 X` 是同一个问题发两家，`@claude 看看这个日志 @codex 写个测试` 是两个不同的 prompt。裸标签时回车会被吞掉，标签和你正在输入的问题保持同一行。
- **规范化事件模型** —— 每个 adapter 把原生 JSONL 翻译成 `session` / `reasoning` / `text` / `tool_start` / `tool_finish` / `file` / `error` / `usage` / `note`。工具失败与真实进程退出码分开表达；`file` 是 Codex 独有的协议事实。
- **按 `runId` 键控的运行表** —— host 不再是「每个 harness 一份快照」，而是一张运行表：同一个 harness 并发多次调用互不覆盖。卡片凭工具 `callId` 找到属于自己的那次运行，找不到才回退到该 harness 最新的一次。
- **增量拉取** —— 浏览器侧调 `get(runId, sinceSeq)`，只取游标之后的新事件；整页共用一个 2s 轮询器，没有进行中的调用时完全停轮询。
- **按时间序的运行实录** —— 点击卡片后按「prompt → 过程段 → 文本块 → 过程段」阅读。文本只出现一次且始终展开；每段连续非文本事件独立折叠，只有实时尾段自动展开。退出码只在 harness 真正报告数字时显示。
- **不静默截断** —— 环形缓冲淘汰事件时上报 `droppedEvents`；面板提示实录从中途开始，并在底部补 adapter 的权威完整回复。
- **会话自动续接** —— 每个 harness 默认续接自己最近一次**成功**的会话，多轮追问天然共享上下文；`newSession` / `sessionId` 可覆盖。同一步内的多次 `harness_call` 并行执行；同一 harness 已有进行中的调用时，后续自动续接改为新开会话，避免两条进程共用一条 CLI 会话。
- **adapter 架构** —— 一个 harness 就是 [`src/host/adapters/`](src/host/adapters) 下的一个 adapter（`build` 构参 / `translate` 翻译事件 / `finalize` 归类结果）；运行身份、序号、相对时间戳和保留策略归存储，不归 adapter。

## 环境要求

- 带 web GUI 的 DSH（`web` profile）
- Node.js >= 20
- PATH 上至少装好并登录了 `claude`、`codex`、`grok`、`kimi` 之一

## 安装

推荐方式——从 npm 安装固定版本：

```sh
dsh plugin --profile web add dsh-harness-call
```

可选方式——直接从 GitHub 安装，跟随 `main`：

```sh
dsh plugin --profile web add github:DomenCai/dsh-harness-call
```

GitHub 源码安装比 npm 发布版更慢、也更容易受本机环境影响，因为仓库不提交构建产物：pnpm 必须在安装机上运行 `prepare` 脚本，要求 Node ≥ 20 且 PATH 上有 pnpm。如果 pnpm 提示 Git 依赖的构建脚本被阻止，请把 pnpm 输出的**完整包标识**加入 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds`，然后重新执行安装命令。

`dsh plugin` 会在 profile 目录里转发给 pnpm，装完自动校准 `dsh.profile.bundles`。本包声明了 `dsh.bundle`，因此会自动加入 profile 的层栈——不用手改 `package.json`。重启 DSH 并硬刷新 web GUI：`@` 菜单出现 harness 分组，agent 侧出现 `harness_call` 工具。

## 用法

直接对话即可：

- `@claude 帮我看看这个目录里有什么` —— 该问题委托给 Claude Code
- `@claude @codex 各自怎么看这个架构方案` —— 同一问题发两家，回复做汇总
- `@codex 分析这个崩溃日志 @grok 查一下相关 issue` —— 两个不同的 prompt

也可以自然语言：「让 Claude 看看这个问题」「对比一下 codex 和 grok 的回答」。

## 设置

打开 **设置 → 外部 Harness**，可以为 Claude / Codex / Grok / Kimi 各自指定：

- **权限**：只读、仓库可写、完全访问，或 **模型决定**
- **思考强度**：low / medium / high / xhigh，或 **模型决定**（Kimi 的词表是 low / high / max，下拉框只给它能接受的档位）

选了具体值，下一次启动就按这个传参，工具参数不再覆盖。选「模型决定」时，才读这次 `harness_call` 的 `access` / `effort`；两边都没选时，用该 CLI 自己配置里的默认档位。

默认四项全部「模型决定」。已经在跑的进程不会改参数。Codex / Grok 的沙箱只在**新会话**上生效，续接沿用创建时的配置。Kimi 的 headless 模式没有权限开关，它的「权限」一项在设置页是禁用的。

设置页顶部还有一个默认关闭的**原始日志采集**开关。每个文件的 `run.start` 都带 `captureVersion: 1`，并记录完整 prompt、去重后的 spawn 参数、原始 stdout、stderr、通过 `sourceSeq` 关联的规范化事件、退出状态与最终结果。环境墓碑统一记为 `null`，真正存在但敏感的值记为 `[REDACTED]`。默认目录是 `~/.dsh/harness-call/logs`。`rawLogFiles` 会自动轮转非活动文件，活动文件绝不删除；普通记录达到 `rawLogBytes` 后停止写入，文件末尾仍会在预算外写入有界的 `capture.truncated` 与 `capture.end`。日志仍可能包含源码和其他敏感信息。

## 配置

下面五项分别约束 host 内存运行表和可选的原始日志采集。在 profile 自己的补丁层 `~/.dsh/profiles/web/cordis.patch.yml` 里覆盖：

```yaml
- id: dsh-harness-call
  config:
    maxEventsPerRun: 400         # 单次运行保留的事件数，超出由环形缓冲淘汰
    maxRuns: 50                  # 保留的运行数，超出丢弃最早那次已结束的运行
    promptPreviewCharacters: 280 # 卡片预览行保留的 prompt 字符数
    rawLogFiles: 200              # 保留的 NDJSON 文件总数，包含正在写入的文件
    rawLogBytes: 33554432         # 单文件普通记录预算（32 MiB），两个尾标记不计入
```

上面写的就是默认值；不需要改的键留空即用默认。

## 安全边界

- **权限**由设置页决定。完全访问会落到各 CLI 最宽的无头模式（Claude `bypassPermissions`、Codex `danger-full-access` + 跳过审批、Grok `off` + `bypassPermissions`），只在信任的环境打开。
- **codex** 在设置为「模型决定」且工具也没传 `access` 时，新会话仍默认 `read-only`。续接的会话保持它创建时的沙箱与可写根目录。
- **claude** 使用自己的凭证存储：`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 会从子进程环境中**移除**（是移除，不是置空），宿主注入的网关凭证不会流到它那里。它没有操作系统级沙箱：`read-only` 是 `--permission-mode dontAsk` 加上内置工具白名单（`Read`、`Glob`、`Grep`、`WebFetch`、`WebSearch`），不是 OS sandbox。`workspace-write` 对应 `acceptEdits`，`full-access` 对应 `bypassPermissions`。
- **kimi** 的 headless 模式（`-p`）没有任何权限开关（`--yolo` / `--auto` / `--plan` 都不能与 `-p` 同用），总是继承 `~/.kimi-code/config.toml` 的 `default_permission_mode`——插件不会改写那份配置，请自行确认它符合你的预期。
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
3. `src/shared/harness.ts` —— 补 key、label，并在 `HARNESS_SESSION_NAMING` 判断新会话由 `caller` 还是 `harness` 命名；工具枚举和输入框提及列表由名册派生。
4. `src/shared/policy.ts` —— 在 `defaultHarnessCallSettings()` 补默认行，并在 `HARNESS_CAPABILITIES` 里声明该 CLI 支持哪些旋钮（不支持的字段在设置页禁用）。
5. `src/host/settings.ts` —— 在 `HarnessCallSettingsSchema` 补一行持久化 schema。
6. `src/client/locales.ts` —— 每个语言补一条 `cand.<key>` 文案，即提及项的说明。

registry、settings schema、capability 表（都对 `HarnessKey` 完备）和语言字典都由编译器把关，漏一步是构建报错，而不是运行时才暴露。

动事件模型、store 或面板之前先读 [`docs/architecture.md`](docs/architecture.md)——那里记着容易踩坏的不变量、各 harness 协议真正不对等的地方，以及已经论证过并否决的设计。推迟的事项在 [`docs/backlog.md`](docs/backlog.md)。

## 许可证

[MIT](LICENSE)
