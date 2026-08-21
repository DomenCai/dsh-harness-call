# 遗留项

四份实施规划落地后剩下的东西。每条都是**有意推迟**,不是忘了做——所以写清了推迟的理由和重启的条件。

## 等上游协议

- **模型侧只回答案,不回过程叙述。** 需要 codex / kimi / grok 在协议里给出「哪条消息是交付物」的标记。目前只有 claude 有（终止 `result` 事件）。在此之前任何切分都是猜——见 [architecture.md](architecture.md) 已否决设计第 1 条。
- **Better Sidebar `reveal` API**（`openTab(seed, scope, { reveal: true })`）。type/meta-only 的 `openTab()` 不保证展开已折叠的侧栏。现在的做法是 snapshot 可见性判断 + overlay 兜底,够用;等第一版体验反馈再决定是否给 Better Sidebar 提这个提案。

## 有意不做

- **`steps` 改成「段数 / 工具数」。** 现在是 store 的 `eventCount`（合并后的语义事件数）。分段之后段数对人更直观,但 `steps` 是**模型侧**字段,人的直观不是改它的理由。
- **Turn 级 Activity 分组。** 现有的最小扩展（`callId` / `phase` / `output`）支持后续演进,但没有具体需求推动。
- **双语 tool description 的 token 成本。** 每行中英各写一遍是双倍 prompt token。这是面向中文用户的产品取舍,不是协议问题。

## 从未端到端验证过的

引入 vitest 之后,纯函数与 adapter 回放有了保护,但下面这些至今只靠真实跑:时间线渲染顺序、键盘行为、过期 tab 提示、tab 恢复。按 [architecture.md](architecture.md) 的测试策略,这些**不打算**补渲染测试——列在这里是为了让下次碰它们的人知道没有网。
