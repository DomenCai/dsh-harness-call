我分析了新版日志、当前面板的数据链路，以及 `DSH-better-sidebar` 的公开接入接口。先给结论：

1. **日志已经足以指导展示重构。**
2. 当前最大缺口不是 CSS，而是统一事件模型过于扁平，尤其缺少：
   - 工具调用 ID；
   - 开始/完成关联；
   - 工具输出；
   - 工具耗时；
   - token usage；
   - stderr/warning。
3. 面板不应该直接解析这些 NDJSON 原始日志。正确路径仍是：
   ```text
   native frame → adapter → shared events → RunStore → Remote → Panel
   ```
4. `dsh-harness-call` 可以接入 `DSH-better-sidebar`，而且它已经提供正式的 `ctx.betterSidebar.registerTab()` 接口。推荐把 Better Sidebar 作为**可选增强表面**，保留现有浮动面板作为降级路径。

本轮只是分析，未修改代码。

---

# 一、新版日志分析

当前有 4 份新版样本：

| Harness | 日志大小 | 原始 stdout | semantic |
|---|---:|---:|---:|
| Grok | 196 KB | 351 条 | 337 条 |
| Claude | 59 KB | 18 条 | 8 条 |
| Codex | 25 KB | 9 条 | 5 条 |
| Kimi | 25 KB | 7 条 | 6 条 |

新格式的去重效果明显：

- 之前 Grok 同类调用约 1 MB，现在约 196 KB。
- `sourceSeq` 正确关联了原生 stdout 和 semantic。
- prompt 引用与环境变量脱敏正常。
- stderr 仍保留完整原始信息。

当前格式适合继续作为协议分析证据。

## 不同 Harness 的真实输出形态

### Grok：高频 token delta

Grok 样本包含：

```text
232 text
95 thought
10 tool_call_update
5 tool_call
5 available_commands
3 usage
1 end
```

语义事件主要是：

```text
232 text
95 reasoning
10 tool
```

这说明：

- `text` / `thought` 基本是 token delta。
- 当前 RunStore 合并连续 `text/reasoning` 的方向是正确的。
- 不应让 UI 逐 frame 展示。
- `available_commands` 继续隐藏是合理的。
- `usage` 和终态 `end` 中有更丰富的 token、model 和费用数据，可进入统一用量摘要。

### Claude：事件少，但单帧内容丰富

Claude 样本包括：

```text
system/init
system/thinking_tokens
assistant
user/tool_result
result
```

当前 adapter 能展示：

- session
- reasoning
- assistant text
- tool input
- cost/turns

但没有展示：

- `tool_result` 中的实际输出；
- thinking token 进度；
- model；
- input/output/cache token；
- 工具调用开始与结果之间的关联。

样本中 3 个 Claude 工具结果分别约为：

```text
5602 字符
5241 字符
831 字符
```

这说明工具输出不适合默认全部展开，但很适合做成“工具卡片 → 展开输出”。

### Codex：原生结构最适合做任务卡片

Codex 原生 frame 明确区分：

```text
item.started
item.completed
```

`command_execution` 中还有：

```json
{
  "id": "item_1",
  "command": "...",
  "aggregated_output": "...",
  "exit_code": 0,
  "status": "completed"
}
```

样本中的命令输出约：

```text
200 字符
11970 字符
```

当前面板只显示命令和 exitCode，约 12K 的输出全部丢失。

Codex 最适合映射为：

```text
命令执行
├─ 命令
├─ 运行状态
├─ 耗时
├─ 退出码
└─ 输出（折叠）
```

### Kimi：工具 ID 与输出已经存在

Kimi 的结构也很清晰：

```text
assistant.tool_calls
tool
assistant.content
session.resume_hint
```

工具结果分别约：

```text
5236 字符
9753 字符
659 字符
```

当前 adapter 用 `tool_call_id` 在内存中找到工具名，但生成的语义事件只剩：

```json
{"kind":"tool","name":"Read","exitCode":0}
```

具体 output 丢失了。

另外，成功的 Kimi 样本里 stderr 出现了 Bash 命令的输出，并且同一内容随后又出现在 `role: tool` stdout frame 中。这意味着：

> stderr 不能简单等同于错误。

后续应该区分：

- run error；
- warning/diagnostic；
- 工具 output；
- CLI stderr 原始诊断。

---

# 二、当前面板的展示模型

当前链路是：

```text
CLI JSONL
  → src/host/adapters/*.ts
  → HarnessEvent
  → src/host/runs.ts
  → Remote list/get
  → src/client/runs.ts
  → HarnessCallCard / HarnessPanel
```

## 现有统一事件

`src/shared/events.ts` 只有：

```ts
session
reasoning
text
tool
file
error
usage
note
```

其中工具事件只有：

```ts
{
  kind: 'tool'
  name: string
  input?: unknown
  exitCode?: number
}
```

它无法表达：

- tool call ID；
- 工具状态；
- started/completed；
- output；
- 开始和结束时间；
- duration；
- 并行工具调用；
- stdout/stderr；
- 工具结果是否被截断。

所以当前面板不是“没有把已有数据画好”，而是 **UI 根本没有收到足够的数据**。

## 当前面板可以展示

`src/client/HarnessPanel.tsx` 当前支持：

- session；
- reasoning；
- text；
- tool name；
- 完整 tool input disclosure；
- exitCode；
- file create/edit/delete；
- error；
- note；
- elapsed、cwd、new/resume；
- cost 和 turns；
- dropped event 提示；
- final reply。

## 当前面板的结构

```text
Header
Meta：session / mode / elapsed / cwd

Body
├─ 过程（details）
│  └─ 事件平铺时间线
├─ Errors
├─ Final reply
└─ Prompt（仅运行中）

Footer
└─ cost / turns
```

### 优点

- 实现简单。
- 跨 harness 一致。
- finished run 默认折叠过程，回复优先。
- live run 默认展开过程。
- ring buffer 截断不会静默。

### 限制

#### 1. 时间线是平铺的

工具调用开始和结束是两个独立行：

```text
25s Read { path: ... }
25s Read exit 0
```

无法组合成一张工具卡片。

#### 2. reasoning 和 text 比例失衡

尤其 Grok，即便 Store 已合并 delta，面板仍然是在展示“事件流”，没有更高一级的 turn/group 概念。

#### 3. 工具输出完全不可见

这是日志暴露出的最大信息缺口。

#### 4. 最终回答没有 Markdown 渲染

当前 `white-space: pre-wrap`。样本里的：

```markdown
**项目简介**
`harness_call`
```

会原样显示星号和反引号，而不是富文本。

#### 5. Prompt 只在运行中显示

完成后 `target.prompt` 其实通常仍存在，但 JSX 明确用了：

```tsx
{!done && target.prompt !== undefined && ...}
```

如果要做完整 Run Inspector，finished run 也应允许查看 prompt。

#### 6. stderrTail 没被客户端使用

Host 的失败结果已有 `stderrTail`，但 `src/client/runs.ts` 没有解析，面板自然无法显示。

#### 7. 浮动窗口空间太小

当前 CSS：

```css
width: min(420px, calc(100% - 32px));
max-height: min(60%, 560px);
```

如果加入工具 output、token usage、长 reasoning，这个空间明显不够。

#### 8. 轮询存在性能细节

`src/client/runs.ts` 每 2 秒增量轮询。架构本身合理，但：

- detail 请求没有显式 in-flight 防重入；
- 慢请求可能重叠；
- events 累积每次复制数组；
- timeline 无虚拟化；
- 长 tool input 在 render 中 stringify。

这不是当前最紧急的问题，但搬进长期打开的 sidebar 后需要处理。

---

# 三、我建议的面板信息架构

现在先不要立即定最终视觉，我建议先确定下面三层。

## 第一层：Run Summary

固定在顶部：

```text
Claude Code                  ● 完成
新会话 · 27.8s · $0.2726 · 4 turns
cwd /Users/.../dsh-harness-call
```

可选再放：

```text
read-only · default effort · claude-opus-...
input 52K · output 940 · cached 31K
```

这需要扩展 usage/run metadata。

## 第二层：Activity

不要继续叫单纯“时间线”，应以**活动组**为主要单元：

```text
思考
  正在分析项目结构……

Read README.md                          ✓ 0.3s
  参数
  输出（5.4K 字符）                     [展开]

Read package.json                       ✓ 0.2s
  参数
  输出（5.1K 字符）                     [展开]

Bash find src -type f                   ✓ 0.1s
  输出（831 字符）                      [展开]
```

建议统一事件改成类似：

```ts
type HarnessEvent =
  | { kind: 'reasoning', text: string }
  | { kind: 'text', text: string }
  | {
      kind: 'tool'
      callId: string
      name: string
      phase: 'started' | 'completed' | 'failed'
      input?: unknown
      output?: string
      exitCode?: number
    }
```

但是更好的设计是让 Store 直接持有“工具活动状态”，避免 UI 自己拼事件：

```ts
interface ToolActivity {
  callId: string
  name: string
  startedAt: number
  finishedAt?: number
  input?: unknown
  output?: string
  exitCode?: number
  status: 'running' | 'done' | 'failed'
}
```

这里需要谨慎：当前 Store 的核心是 append-only event stream。为了增量轮询兼容，最小改法仍然是：

```text
tool-start
tool-finish
```

然后由 Client projection 按 `callId` 聚合成卡片。不要马上把 RunStore 改成多个独立集合。

## 第三层：Final Answer

最终回复独立于 Activity：

- 支持 Markdown。
- 默认优先展示。
- 提供复制按钮。
- running 时显示 streaming reply。
- finished 后 Activity 默认折叠。

---

# 四、展示优化的建议顺序

## 阶段一：不改变事件协议

高性价比、小风险：

1. 展示失败结果中的 `stderrTail`。
2. finished run 也能展开 prompt。
3. Card 改为键盘可访问的 button/role button。
4. 面板关闭时恢复打开前焦点。
5. `useRunDetail` 增加 in-flight 防重入。
6. final reply 使用 Markdown 渲染，或复用 DSH 已有消息渲染表面。
7. Header/Meta 重新排版，避免 session 和 cwd 挤在一条长文本中。
8. 工具 started/completed 相邻事件在客户端做启发式合并。

最后一项只能作为过渡，因为现在没有 callId；并行调用时无法可靠关联。

## 阶段二：扩展统一协议

优先补：

1. `callId`
2. `phase/status`
3. `output`
4. `duration`
5. token usage
6. model
7. stderr diagnostic

这一步才真正解决日志揭示的主要问题。

## 阶段三：使用 Better Sidebar

把完整 Run Inspector 搬到 sidebar，同时保留轻量 fallback。

---

# 五、接入 DSH-better-sidebar 应该怎么做

它已经为外部插件提供正式服务：

```ts
ctx.betterSidebar.registerTab(...)
ctx.betterSidebar.openTab(...)
```

实现位置：

- 服务提供：`DSH-better-sidebar/src/client/index.tsx:62-69`
- 服务契约：`DSH-better-sidebar/src/client/service.ts:294`
- 接入文档：`DSH-better-sidebar/docs/external-plugin-guide.md`
- Context 类型：`DSH-better-sidebar/src/context-types.ts:414-475`

当前版本是 `0.12.3`，已有：

- registerTab
- targetedOpen
- tabMeta
- badge
- lifecycle
- stateSubscription
- pluginSettings

足够完成接入，不需要修改 Better Sidebar 源码。

## 推荐的产品行为

### 未安装 Better Sidebar

保持现在的行为：

```text
点击 harness card → 打开浮动 HarnessPanel
```

### 已安装 Better Sidebar

```text
点击 harness card → 在当前会话的右侧栏打开 Harness Run tab
```

tab ID 建议按 run 唯一：

```text
harness-call:run:<runId>
```

tab type：

```text
dsh-harness-call:run
```

这样：

- 不同 run 可以同时打开；
- 重复点击同一 run 聚焦已有 tab；
- tab 可在右栏/底栏拆分；
- 用户可以一边看对话一边看 harness 过程；
- 使用 `visible` 暂停隐藏 tab 的轮询。

## 推荐的 descriptor

概念代码如下：

```tsx
ctx.effect(() =>
  ctx.betterSidebar.registerTab({
    id: 'dsh-harness-call:run',
    title: () => t('sidebar.run'),
    order: 55,
    hidden: true,

    dedupeKey: tab =>
      typeof tab.meta === 'object' && tab.meta !== null
        ? String((tab.meta as { runId?: unknown }).runId ?? tab.id)
        : tab.id,

    component: ({ tab, scope, visible }) => (
      <HarnessRunView
        runId={readRunId(tab.meta)}
        sessionId={scope.sessionId}
        visible={visible}
        feed={feed}
        t={t}
      />
    ),
  })
)
```

点击卡片时：

```ts
ctx.betterSidebar.openTab(
  {
    type: 'dsh-harness-call:run',
    id: `harness-call:run:${runId}`,
    title: `${label} · Run`,
    meta: {
      runId,
      callId,
      harness,
      label,
      result,
      prompt,
    },
  },
  {
    sessionId,
    cwd,
  },
)
```

注意 `meta` 会持久化，必须是 JSON 可序列化数据。不要放：

- feed 函数；
- translate function；
- React element；
- Cordis/Remote live object。

只放最小标识数据，组件中的 `feed` 和 `t` 通过注册时闭包获得。

## 需要做的代码重构

当前 `HarnessPanel` 把数据解析、轮询、布局和 overlay 外壳混在一个组件里。

建议先拆成：

```text
HarnessRunView
  ├─ 负责 run 数据和实际内容
  ├─ 不知道 overlay/sidebar
  └─ 接收 visible、run target、feed、t

HarnessOverlayPanel
  └─ aside/dialog/close/Escape/focus 外壳

BetterSidebar registration
  └─ 直接渲染 HarnessRunView
```

这是最重要的接入 seam。不要复制一份 Sidebar 专用面板。

## 可选依赖方式

在 `package.json` 增加：

```json
{
  "peerDependencies": {
    "dsh-better-sidebar": "^0.12.3"
  },
  "peerDependenciesMeta": {
    "dsh-better-sidebar": {
      "optional": true
    }
  },
  "devDependencies": {
    "dsh-better-sidebar": "link:../DSH-better-sidebar"
  }
}
```

Client 侧只做 type import：

```ts
import type {} from 'dsh-better-sidebar/client/service'
import type {
  BetterSidebarService,
  TabComponentProps,
} from 'dsh-better-sidebar/client/service'
```

不要 value-import Better Sidebar。运行时必须只走：

```ts
ctx.betterSidebar
```

否则会撞上 client bundle purity 和跨插件 ModuleLoader 边界。

## 强依赖还是软依赖

Better Sidebar 文档有两种说法：

- 示例使用：
  ```ts
  export const inject = ['betterSidebar']
  ```
- 同时又建议 optional peer，使未安装时插件照常工作。

对于 `dsh-harness-call`，我建议**软依赖**，因为现有浮动面板是完整可用的功能，不能因为未安装 Better Sidebar 就让整个 client half 停止激活。

实现可采用局部动态注入：

```ts
ctx.inject(['betterSidebar'], (sidebarCtx) => {
  sidebarCtx.effect(() =>
    sidebarCtx.betterSidebar.registerTab(...)
  )
})
```

外层 client 插件的 required `inject` 继续保持：

```ts
export const inject = ['slots', 'inputTriggers', 'locale', 'remote']
```

这样：

- Better Sidebar 出现时注册 tab；
- Better Sidebar 卸载时自动注销；
- Harness Card、设置和 overlay 始终存在；
- HMR 生命周期由 Cordis 管理。

点击时不能只看静态变量是否曾注册，应实时读取服务：

```ts
const sidebar = ctx.get('betterSidebar')
```

如果服务存在且 feature 至少包含：

```text
targetedOpen
tabMeta
```

则使用 sidebar；否则走 overlay。

如果 TypeScript 对可选 service 不方便，也可在 client 本地重述最小接口。这也是 Better Sidebar 文档给出的真实接入案例方式。

## sidebar 自动展开问题

Better Sidebar 的 `openTab()` 只有 seed 带 `path` 或 `url` 时才保证自动展开面板。Harness run tab 是 type/meta 内容，不带 path。

因此点击 Card 时如果右侧栏当前折叠，单纯：

```ts
openTab({ type, meta })
```

可能只创建/激活 tab，不自动打开工作台。

这是当前 Better Sidebar API 的一个接入细节。可以选择：

### 方案 A：先接受现有行为

用户已打开 sidebar 时使用 sidebar，否则 fallback overlay。

优点是无需触碰 sidebar state。

### 方案 B：注册 tab 后用公开 snapshot/store 能力控制打开

Better Sidebar 暴露了状态和 `TabComponentProps.store`，但公共服务没有一个明确的：

```ts
openPanel()
```

不建议消费插件直接操作它的内部 reducer/state 结构。

### 方案 C：给 Better Sidebar 提一个小 API

例如：

```ts
openTab(seed, scope, { reveal: true })
```

或者：

```ts
revealTab(tabId, scope)
```

这是如果要做到“点击卡片永远在 sidebar 中可见”时，唯一干净的方式。

也就是说：

> 注册 tab 本身不需要改 Better Sidebar；如果要求 type-only tab 自动展开折叠的面板，最好为 Better Sidebar 补一个公开 reveal 能力，而不是让 harness-call 修改 sidebar 内部状态。

短期可以给 seed 带一个语义为空的 `path` 来触发展开，但这是滥用 API，不推荐。

## 安装本地 Better Sidebar

当前 Web profile 尚未安装 `dsh-better-sidebar`。现有 `~/.dsh/profiles/web/package.json` 中没有该依赖或 bundle。

本地联调可以运行：

```bash
dsh plugin --profile web add "link:/Users/caidongmeng/Documents/Github/dsh-plugin/DSH-better-sidebar"
```

如果 CLI 对 `link:` 形式不接受，可进入 profile：

```bash
cd ~/.dsh/profiles/web
pnpm add "dsh-better-sidebar@link:/Users/caidongmeng/Documents/Github/dsh-plugin/DSH-better-sidebar"
```

然后确保 profile 的 bundle 列表包含：

```json
"dsh-better-sidebar"
```

官方 CLI 通常会根据其 `cordis.patch.yml` 自动同步 bundle，无需手工修改。

另外 Better Sidebar 的 `cordis.patch.yml` 使用：

```yaml
id: better-sidebar
name: dsh-better-sidebar
```

不要再额外手工添加第二份 mount row，否则会双重挂载。

## 构建/HMR

- Better Sidebar client change：需要在其仓库运行 watcher。
- Harness Call client change：需要在当前仓库运行 watcher。
- 但开发说明中的“自动 HMR”仍受 DSH Web 构建链限制；至少要确保当前 DSH 进程实际加载的是两个本地 link。
- 首次安装 Better Sidebar 包和 host half：重启 DSH。
- Client bundle 更新后：如果没有对应 watcher，重新 build 后硬刷新。
- 不要启动新的 Vite server；它不会更新现有的 <http://127.0.0.1:3080>。

---

# 六、推荐的下一步讨论顺序

我建议我们接下来先决定这三个问题：

1. **面板位置**
   - 只保留浮动面板；
   - Better Sidebar 优先、浮动面板降级；
   - 两种入口都保留，让用户自行选择。

2. **工具输出范围**
   - 全部进入内存 RunStore；
   - 每个工具 output 设置字符上限；
   - 超限时保留 tail/head 并显示截断；
   - 或仅在原始日志开启时保存全部。

3. **Activity 数据模型**
   - 最小扩展：给 tool 增加 callId/phase/output；
   - 完整重构：新增 ToolActivity/Turn 分组；
   - 我倾向先做前者，保留 append-only event seam，由 Client 聚合成卡片。

我的建议组合是：

> **Better Sidebar 优先 + 浮动面板降级；统一事件新增 `callId/phase/output`；Client 聚合为工具活动卡片；final reply 使用 Markdown；raw log 继续只作为诊断证据，不进入浏览器。**

收到。这个补充澄清了一个重要点：

> 接入 Better Sidebar 不需要修改 Better Sidebar，也不应该寻找它的内部 Slot；直接消费其公开的 Client Cordis Service 即可。

最终推荐架构如下：

```text
HarnessCallCard
  └─ openRun(target)
       ├─ betterSidebar 服务和 tab 已就绪
       │    └─ betterSidebar.openTab(...)
       └─ 否则
            └─ 打开现有 shell.overlay
```

## 接入原则

- 保留现有：
  - `tool.call.toolview` 卡片；
  - `@harness` 提及；
  - 设置页；
  - `shell.overlay` 降级面板。
- 使用独立可选子 Fiber 注册 Better Sidebar tab：

```ts
ctx.inject(['betterSidebar'], sidebarCtx => {
  sidebarCtx.effect(() =>
    sidebarCtx.betterSidebar.registerTab({
      id: 'dsh-harness-call:run',
      // ...
    }),
  )
})
```

不要将 `betterSidebar` 添加到顶层：

```ts
export const inject = [...]
```

否则用户未安装 Better Sidebar 时，整个客户端插件都不会激活。

## 组件拆分

```text
HarnessRunView
  ├─ 运行详情内容
  ├─ 数据轮询
  └─ 支持 visible 暂停轮询

HarnessOverlayPanel
  ├─ aside / dialog
  ├─ Escape / close
  ├─ focus 管理
  └─ 包裹 HarnessRunView

HarnessSidebarTab
  └─ 使用 Better Sidebar 的 visible 渲染 HarnessRunView
```

## Tab 策略

推荐一个 run 一个 tab：

```text
type: dsh-harness-call:run
id: dsh-harness-call:run:<callId 或 runId>
```

`meta` 只保存 JSON 数据：

```ts
{
  callId,
  runId,
  harness,
  label,
  prompt,
  result
}
```

不能保存：

- `feed`
- `t`
- Remote 对象
- React Element
- Cordis Context

这些通过注册组件的闭包取得。

## 依赖方式

`package.json`：

```json
{
  "peerDependencies": {
    "dsh-better-sidebar": "^0.12.3"
  },
  "peerDependenciesMeta": {
    "dsh-better-sidebar": {
      "optional": true
    }
  },
  "devDependencies": {
    "dsh-better-sidebar": "link:../DSH-better-sidebar"
  }
}
```

仅使用 type import：

```ts
import type {} from 'dsh-better-sidebar/client/service'
import type {
  BetterSidebarService,
  TabComponentProps
} from 'dsh-better-sidebar/client/service'
```

运行时只调用 `ctx.betterSidebar`，不能 value-import Better Sidebar 实现。

## 安装

两个插件应分别作为 Web profile bundle 安装：

```bash
dsh plugin --profile web add "link:/Users/caidongmeng/Documents/Github/dsh-plugin/DSH-better-sidebar"
dsh plugin --profile web add "link:/Users/caidongmeng/Documents/Github/dsh-plugin/dsh-harness-call"
```

需要避免 Better Sidebar 同时通过以下两种方式挂载：

- npm/bundle channel；
- 旧的手动 `cordis.patch.yml` row。

否则会出现两份 Host half 或两个 sidebar。

## 不再需要预先修改 Better Sidebar

此前提到的 reveal 问题仍存在：type/meta-only `openTab()` 不保证自动展开已折叠的侧栏。但这不阻碍第一版集成。

第一版可以采用以下行为之一：

- sidebar 已打开时使用 sidebar，否则走 overlay；
- 或始终调用 `openTab`，用户自行展开 sidebar；
- 后续再视体验决定是否向 Better Sidebar 增加公开 `reveal` 能力。

目前全部是只读分析，没有文件变更。