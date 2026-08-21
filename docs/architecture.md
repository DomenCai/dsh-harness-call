# 架构约束

README 讲这个插件**是什么**、怎么装、怎么加一个 harness。本文只讲改代码时**容易踩坏的东西**：数据链路、必须守住的不变量、看起来像缺口但其实是协议事实的地方，以及已经论证过并否决的设计。

引用一律用符号名而非行号——行号会漂。

## 数据链路

```text
native JSONL frame
  → adapter.translate()      每行 → 0..n 个 HarnessEvent，纯翻译
  → RunStore                 seq / 相对 at / 环形缓冲 / 工具输出截断
  → Remote (get(runId, sinceSeq))
  → RunStore (client, src/client/runs.ts)
  → buildSegments()          按 text 事件边界切段
  → HarnessRunView
```

两条分工在 [`src/host/adapter.ts`](../src/host/adapter.ts) 的契约注释里写着，这里重申一次因为它最常被违反：

- **`translate` 只做翻译。** 不截断、不编号、不打时间戳、不做展示决策。
- **`seq`、相对 `at`、环形缓冲、`droppedEvents`、工具输出截断属于 `RunStore`**（[`src/host/runs.ts`](../src/host/runs.ts)）。截断放在 store 而不是 adapter，是为了让 raw log 保持无损——采集发生在 adapter 之前。

## 必须守住的不变量

1. **`deliveredSeq` 与增量轮询**（`runs.ts` 的 `mergeDelta` 注释）。客户端只请求 `seq > sinceSeq`,已交付的事件不可再变。想改事件形状之前先读那段注释——它是全仓最完整的推理。
2. **live == final**（`adapters/codex.ts` 的分隔符注释）。运行中显示的字节序列必须与完成后的权威文本一致。曾经因为「最终文本只取最后一条 `agent_message`」而回归过一次:回复会在完成瞬间当场缩短。
3. **Remote 边界拒绝 `undefined` 值的自有属性**（`runs.ts` 的 `toSummary` / `toStored` 注释）。要省一个字段就**不写这个键**,不要写 `undefined`。
4. **`argsRaw` 在调用中是不完整的 JSON 前缀**（`src/client/runs.ts` 的 `readArgs`）。卡片会在半截参数上渲染,依赖 `args.harness` 做 label 回退时必须接受它在极早期是 `undefined`。这不是错误路径。
5. **`sourceSeq` 是 raw log 唯一的因果链**（[`src/host/tool.ts`](../src/host/tool.ts) 里 `stdout` 与 `semantic` 两处 `rawLog.write`）。任何触碰采集顺序的改动都要保证 `semantic` 的 `sourceSeq` 仍指向产生它的那条 `stdout`——`tests/adapters.spec.ts` 的整个回放能力架在这一条上。
6. **采集失败永不影响 run**（`openRawRunLog` 的注释）。轮转与截断越界时只停写并标记:不抛、不重试、不阻塞。
7. **永远不要让模型可见的数据由环形缓冲推导。** 事件走环形缓冲（`maxEventsPerRun` 默认 400，可配更小），`deliveredSeq` 又让轮询后的 delta 无法继续合并。任何从事件序列反推出来的「结论」都会在缓冲淘汰后静默变成回复尾巴,而且非空、不触发兜底。

## 协议事实，不是待补的缺口

这几处看起来像「只做了一半」,但都是各 CLI 协议能力不对等的直接结果。在它们上面建统一抽象会双重上报或者靠猜。

| 现象 | 为什么是事实 |
|---|---|
| `kind: 'file'` 只有 codex 发 | codex 的 `file_change` item 不伴随任何工具调用,是它唯一的文件信号。另外三家的文件改动本身就是工具调用（`Edit` / `Write` / `edit_file`）,已经是一张工具卡;再合成 `file` 行会让同一次修改在同一个过程段里出现两遍。 |
| `exitCode` 与 `failed` 是两个字段 | `exitCode` 只承载**真实进程退出码**（codex `command_execution` 的 `127` 和 `1` 对排障不是一回事）;`failed` 承载「harness 说它失败了」。kimi 两个都不写。合并成单个 `ok: boolean` 会丢掉唯一有信息量的值。 |
| 四家 `session` 事件时机不同 | 协议差异,已在各 adapter 注释里说明。`HARNESS_SESSION_NAMING`（[`src/shared/harness.ts`](../src/shared/harness.ts)）区分谁命名 session;`harness` 自己命名的家族在新会话时以 `null` 开局,面板显示「待 harness 报告」,不伪造 id。 |
| 只有 claude 能给出「最终答案」 | claude 的终止 `result` 事件直接带最终文本,adapter 就用它。codex / kimi / grok 的协议里没有「哪条消息是交付物」这个字段,grok 连消息边界都没有。 |
| `DEFAULT_MAX_TOOL_OUTPUT_BYTES` 是常量,不可配 | 唯一构造点从不传值,而客户端的截断标注读同一个常量。一旦可配且真被改成别的值,UI 就会稳定地说错保留量。常量是唯一事实源,不一致便无从发生。 |

## 已否决的设计（不要重新引入）

按提出频率排序。每条都有具体的失效场景,不是口味问题。

1. **「最终答案 = 最后一个连续 text 块」作为模型侧 `text`。** grok 输出完整报告 → 调一次校验工具 → 只说「验证通过」,那句尾注就成了答案,报告被判成叙述。另外两条独立失效:违反不变量 7,以及破坏不变量 2。
2. **给 claude / grok / kimi 补 `file` 事件做统一的「文件变更」概念。** 双重上报,见上表第一行。
3. **成功路径返回聚合统计**（`tools` / `files` / `reasoningBlocks`）。`steps` 已经说明活动量;工具调用多不代表结论可靠;`files: 0` 也不能证明没改文件——各 adapter 对文件变更的归一化能力不等价。
4. **成功时保留 `events`。** 占返回体积约 40% 而没有消费者。现在只在 `!ok` 或 `text` 为空时返回,且只留最后 15 条、过滤掉 `text` / `reasoning` / `usage`。
5. **用 `presentationMeta` 承载 UI 专属富载荷。** code mode 的子调用带 `parent`,宿主只在 `parent === undefined` 时计算它。而 `@harness` mention 与 code mode 都是常用路径,UI 会在最常用的路径上拿不到数据。
6. **给 raw log 加压缩,或去掉 `semantic` 去重。** 文件里那 1.6~1.9 倍开销的另一半正是 `semantic`——适配器的解释,也就是这份语料全部价值的来源。去掉它等于把文件降级成一堆 CLI 原始输出,`sourceSeq` 因果链一并消失。要管的是总量（`rawLogFiles` / `rawLogBytes`）,不是倍数。
7. **过程区限高 + 内部滚动。** 按时间序排布后,正在生长的实时段永远在最底部,往下长不挤任何东西。问题消失,补丁不必要。
8. **保留已删参数「以防旧调用」。** 没有持久化的调用方:模型每轮从 schema 重新读参数表。留着的成本是每次请求的 token 与一条永不覆盖的分支。

## 测试策略

`pnpm test`（vitest）。五个 suite,全部是纯函数与 ndjson 回放,零运行时依赖:

- `adapters.spec.ts` — 用真实 CLI 的 `stdout.raw` 当输入语料回放四家 adapter,期望值单独存为 `tests/fixtures/*.expected.json`,另加 argv 构造与「codex 报失败但 `exit_code` 为 0」这类边界语义。**语料与期望必须分离**:raw stdout 是 CLI 的事实,不会因为我们改代码而变;期望是我们的行为,应当可被有意更新。不要把旧 ndjson 里的 `semantic` 块直接当期望——它编码的正是被改掉的旧行为。
- `segments.spec.ts` — `buildSegments()` 的分段边界,含 polling 伪边界（相邻 text 事件精确拼成一段、跨事件的 Markdown fence 不被切开）、孤儿 finish 的位置、自动展开规则,以及「回放语料的每个 text 字节都在分段里」。
- `result.spec.ts` — `buildModelResult()`:成功路径的紧凑性、可选字段缺值时不写键、失败诊断的过滤与 15 条上限。
- `pure.spec.ts` — `truncateHeadTail`、`projectActivities`、`normalizeHarnessCallSettings` / `resolveRunPolicy`、`matchRun`、`unsettledCardState`。
- `raw-log.spec.ts` — 轮转（活动文件永不删）、字节预算与尾标记、墓碑保真。

**明确不测**:

- UI 渲染。成本远超它能保护的东西,验证靠真实跑。
- `RunStore` 的环形缓冲与 `mergeDelta` 时序。不变量依赖多客户端轮询节奏,构造出来的测试会把实现细节钉死。真要动它,靠调小 `maxEventsPerRun` 的真实验证更可靠。
- subprocess 生命周期。那是宿主 `dsh-subprocess` 的职责。

真实跑的验证路径:在设置页打开 Raw log capture,读 `~/.dsh/harness-call/logs`。
