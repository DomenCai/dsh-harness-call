# Run Inspector 重构：最终方案

> 本文是 `docs/handoff.md` 第六节三个待决策问题的收敛结论，由主 agent 与 Claude Code 两轮讨论达成一致（第一轮全面方案，第二轮对 5 个分歧点逐条收敛，全部达成一致）。实施以本文为准。

## 一、三个决策的最终结论

| 问题 | 决策 |
|---|---|
| Q1 面板位置 | **Better Sidebar 优先 + 浮动面板降级**。点击卡片时实时读取服务并用 `getSnapshot()` 判断侧栏可见性：可见 → `openTab` 进 sidebar；不可见（折叠/窄屏抽屉未开）→ fallback 现有浮动面板。第一版不做用户设置、不向 Better Sidebar 提 reveal API（留作后续升级项）。 |
| Q2 工具输出范围 | **每工具 output 上限 16KB（head 12KB + tail 4KB）**，截断发生在 **RunStore 的 `toStored` chokepoint**（`RunStoreOptions.maxToolOutputBytes`，默认 16384），事件携带 `outputTruncated` / `outputOriginalBytes` 标记。raw log 永远保留完整原文（截断放 store 层而非 adapter 层的决定性理由：semantic 事件在进入 store **之前**就写入 raw log，adapter 层截断会破坏其 lossless 定位）。客户端渲染层另叠 `headTailCap` 行数折叠（默认折叠可展开），与内存字节上限是两回事。 |
| Q3 Activity 数据模型 | **独立 kind：`tool_start` / `tool_finish`**（不用 phase 字段——start/finish 字段集不相交，两个成员表达最精确）。四个 adapter 一律只发 start/finish 对；harness 只报单一时刻的（如 codex `web_search` 只在 `item.completed` 出现）由 adapter 在同一帧合成两条（duration=0）。旧 `tool` kind 保留在 union 中仅为 wire 兼容，新代码不再产生。Client 按 `callId` 投影聚合为工具卡片，append-only 事件流 + `deliveredSeq` 不变量不动。 |

讨论中被否决的备选：①「始终 openTab 不做可见性判断」——侧栏折叠时点击卡片视觉上毫无反馈，体验破碎；②「phase 字段单 kind」——input/output 互斥但同处一个成员，类型无法精确表达；③「adapter 层截断」——破坏 raw log lossless + 第 5 个 harness 接入时可能忘记；④「react-markdown 依赖」——DSH 已有现成组件（见下）。

## 二、事件模型（src/shared/events.ts）

```ts
export type HarnessEvent =
  | { kind: 'session', sessionId: string }
  | { kind: 'reasoning', text: string }
  | { kind: 'text', text: string }
  // 保留：wire 兼容，新代码不再产生
  | { kind: 'tool', name: string, input?: unknown, exitCode?: number }
  | { kind: 'tool_start', callId: string, name: string, input?: unknown }
  | {
      kind: 'tool_finish'
      callId: string
      name: string            // 冗余携带，孤儿 finish 也能显示
      output?: string         // 已被 store 截断
      outputTruncated?: boolean
      outputOriginalBytes?: number
      exitCode?: number
    }
  | { kind: 'file', path: string, change: 'create' | 'edit' | 'delete' }
  | { kind: 'error', message: string }
  | {
      kind: 'usage'
      costUsd?: number
      turns?: number
      inputTokens?: number
      outputTokens?: number
      cachedTokens?: number
      reasoningTokens?: number
      model?: string
    }
  | { kind: 'note', text: string }
```

- usage 扩展字段同时落到 `RunSummary`（footer 从 summary 读，与 costUsd/turns 同先例）。
- model 来源：claude `result.model`、grok end frame、codex token_count；kimi 无则缺省。
- 缺 callId 的 finish/开始事件降级为 `note`（如「tool Read completed」），**不造合成 id**（合成 id 会错进 client 投影的 orphan 路径）。

## 三、展示原语：零新增依赖

`@deepseek-ai/dsh-client-ui-primitives`（已 inject、已在 devDeps）已提供全部所需：

- **MarkdownText**：GFM + TeX，专为不可信 assistant 输出设计 → final reply 渲染；
- **TerminalBlock**：`{ command, cwd?, home?, output?(支持 ANSI), exitCode?, signal? }` → command_execution 卡片直接复用；
- **CodeBlock / JsonBlock / headTailCap**（行数 head/tail 折叠 + 展开语义）→ 其它工具输出与默认折叠。

## 四、三阶段实施

### 阶段一：协议扩展与 adapter 改造（先做协议，避免 UI 返工）

| 文件 | 改动 |
|---|---|
| `src/shared/events.ts` | 上面的 union 扩展 + RunSummary 加 usage 字段 |
| `src/host/runs.ts` | `RunStoreOptions.maxToolOutputBytes`（默认 16384）；`toStored` chokepoint 对 `tool_finish.output` 做 head(12K)+tail(4K) 安全 UTF-8 切分截断；usage 字段镜像进 record/summary |
| `src/host/tool.ts` | **`describeEvent` 穷举 switch 必须加新 kind**（否则 typecheck 直接失败）：digest 中重新合并为一行——`tool_start → "25s tool Read {…}"`、`tool_finish → "25s tool Read exit=0 output=5.4K"`（模型不需要知道两阶段内部结构）；扩展 usage digest |
| `src/host/adapters/grok.ts` | `tool_call→tool_start`；`tool_call_update→tool_finish`（exitCode 从 status 推导）；State.tools 改 `Map<callId, name>` |
| `src/host/adapters/claude.ts` | `tool_use→tool_start`（映射 `id`）；**新增 `user` frame 处理：`tool_result` block → `tool_finish`**（当前完全未处理，输出全丢）；result 的 model/usage tokens 进 usage 事件 |
| `src/host/adapters/codex.ts` | **新增 `item.started` 处理 → `tool_start`**；`item.completed(command_execution)→tool_finish`（aggregated_output 原样交给 store，不在 adapter 截断）；web_search 等单帧工具合成 start+finish；token_count 进 usage |
| `src/host/adapters/kimi.ts` | `assistant.tool_calls→tool_start`；`role:tool→tool_finish`（content 原样，当前被丢弃）；`Map<callId, name>` 保留 |
| `src/host/adapter.ts` | `RunResult.extras` 加 usage 字段类型 |

验证：每 harness 真实跑一次，核对 start/finish 配对、16KB 截断与 raw log 完整性、digest 格式。

### 阶段二：Client 投影与 UI（并入原 handoff 阶段一的全部小项）

| 文件 | 改动 |
|---|---|
| `src/client/activities.ts`（新增） | `projectActivities(events) → { tools: ToolActivity[], orphans }`：按 callId 聚合，卡片按 startSeq 排序（finish 不移位、running 占位），孤儿 finish（start 被 ring buffer 驱逐）单独收集 |
| `src/client/ToolActivityCard.tsx`（新增） | 状态（running/done/failed）+ 耗时（finish.at − start.at 推导，不单独存储）+ input/output 折叠（TerminalBlock / CodeBlock + headTailCap）+ 截断标注「显示 16KB / 1.2MB」 |
| `src/client/HarnessRunView.tsx`（新增） | 从 HarnessPanel 拆出纯内容组件：run 数据 + 轮询 + `visible` 暂停轮询；不知道 overlay/sidebar 外壳 |
| `src/client/HarnessPanel.tsx` | 改为外壳（aside/Escape/focus）+ 包裹 HarnessRunView；final reply 用 MarkdownText；**stderrTail 展示**（wire 上已有该字段，仅 `readResult` 未解析）；finished run 也显示 prompt（去掉 `!done &&`）；Header/Meta 分行重排；关闭时恢复焦点；footer 加 tokens/model |
| `src/client/runs.ts` | RunView 加 `activities` 投影；`useRunDetail` 加 `active` 参数 + in-flight 防重入；`readResult` 补 `stderrTail` |
| `src/client/HarnessCallCard.tsx` | tool 行替换为 ToolActivityCard；卡片键盘可访问（role="button"） |
| `src/client/locales.ts` | 新 key：activity.input/output/orphans/truncated 等 |

### 阶段三：Better Sidebar 集成（软依赖）

| 文件 | 改动 |
|---|---|
| `src/client/index.tsx` | type-only import（`import type {} from 'dsh-better-sidebar/client/service'`）；`ctx.inject(['betterSidebar'], ...)` 局部子 fiber 注册 tab（**不加进顶层 inject**，未安装时 client half 必须照常激活）：id=`dsh-harness-call:run`、hidden=true（不进 + 菜单）、`dedupeKey` 按 meta.runId（同 run 聚焦已有 tab）、component 用 `props.visible` 渲染 HarnessRunView |
| `src/client/HarnessCallCard.tsx` | 点击路由：`ctx.get('betterSidebar')` 实时读取（不看静态注册标记）→ features 含 targetedOpen+tabMeta → `getSnapshot()` 判可见性（窄屏看 `state.panelOpen`；宽屏看 activePane 所在树：bottom → `bottomOpen`，否则 `panelOpen`）→ 可见 `openTab({type,id:harness-run-<callId>,title,meta})`，不可见/服务缺失 → overlay fallback。meta 只放纯 JSON（callId/runId/harness/label/prompt/result），feed/t 通过注册闭包获得 |
| `package.json` | peerDependencies `dsh-better-sidebar: ^0.12.3` + optional Meta；devDeps `link:../DSH-better-sidebar` |

tab 生命周期注意：meta 会持久化，DSH 重启后 tab 恢复但 run store 是内存的 → component 检测 run 拿不到（settled + view undefined + 终态）时显示「Run 已过期（host 重启）」。

## 五、风险与既定应对

1. **孤儿 finish**（start 被 ring buffer 驱逐）：orphans 显式收集 + UI 提示「N 个工具的起始记录已被截断」，仍显示 name/exitCode/output，只是无时长。
2. **并行工具乱序完成**：卡片按 startSeq 排序，finish 只更新状态不移位。
3. **DSH 重启后 tab 恢复指向不存在的 run**：过期提示（见上）。
4. **非 UTF-8 / 多字节字符被切断**：store 截断按字符边界安全切分。
5. **多 sidebar tab 轮询**：`visible=false` 暂停；roster 本就全局共享单 timer。
6. **Markdown 安全**：MarkdownText 本就为不可信输出设计。
7. **可见性判断边缘情况**（窄/宽切换、拖 split 瞬间）：最坏一次误判 → fallback 浮动，可接受。

## 六、遗留项

- Better Sidebar `reveal` API 提案（`openTab(seed, scope, { reveal: true })`）：等第一版体验反馈再决定是否推进。
- handoff 中「Activity 分组（Turn/思考段落分组）」：本方案的最小扩展已支持后续演进，暂不做 Turn 级分组。
- 浮动面板 CSS 尺寸（`min(420px…)/min(60%,560px)`）：阶段二视 HarnessRunView 实际密度再调。

## 七、与 handoff 的差异汇总

- 阶段顺序重排：**协议先行**（原阶段二的协议扩展提前为阶段一），原阶段一的纯 UI 小项并入新阶段二；原阶段一的「started/completed 启发式合并」**砍掉**（无 callId 时本就不可靠，属丢弃型过渡工作）。
- 补漏：`src/host/tool.ts` 的 `describeEvent` 改造（原方案遗漏，typecheck 级问题）。
- react-markdown 依赖 → 复用 dsh-client-ui-primitives（MarkdownText/TerminalBlock/headTailCap）。
- 截断位置 adapter 层 → store 层（raw log lossless 论证）。
- 输出上限 8KB → 16KB（12K 真实样本完整保留）。
- reveal：始终 openTab → snapshot 可见性判断 + overlay fallback。
