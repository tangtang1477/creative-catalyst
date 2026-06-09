# 修复 refining brief 选项卡的渲染顺序

## 问题

当前 `Workspace.tsx` 把工作区输出拆成两段渲染：

1. 顶部：`STAGE_ORDER` 各阶段卡片（structure / wardrobe / cast / paint / qc / life / details）
2. 底部：`chatLog` 中的所有用户/Agent 消息（含已确认的 option cards）

中间额外塞了一段「awaiting 状态的 option cards 钉在 stages 上方」的逻辑。

带来的体验问题（截图所示）：

- `chat-director · refining brief` 这张选项卡，实际创建时间在 `structure` 阶段开始**之前**，但渲染时：
  - awaiting 时被拉到 stages 上方一个特殊位置；
  - 一旦用户点了 Continue / Skip，它马上跳到 `chatLog` 区块——也就是整页**最底部**，出现在 structuring / cast / paint 等所有阶段下方。
- 同理，过程中其它 `chat-director` 消息（等待确认、image-edit 等）也都被堆在最底部，时间线被打乱。

## 目标

按真实时间顺序展示所有输出。具体到这张卡：

- 时间上它在 `structure` 阶段开始之前 → UI 上也必须出现在 structure 卡片之前；
- 用户确认后不要"位置漂移"，仍留在原位，只是状态从 awaiting → 已采纳。
- 其它 agent 消息也按各自时间戳，正确插入到对应 stage 之间。

## 方案：按时间戳合并 chatLog 与 stages，单一时间线渲染

在 `src/components/sc/Workspace.tsx` 的 `inFlow` 渲染块里：

1. **删除两处旧渲染**
   - 删掉"awaiting option cards 钉在上方"的 `chatLog.flatMap(...)` 块（约 215–226 行）。
   - 删掉底部"chatLog.map 渲染用户/agent 消息"的块（约 387–411 行）。

2. **构建统一时间线数组** `timeline: Array<{ ts: number; kind: "chat" | "stage"; ... }>`
   - chatLog 中的每条消息 → `{ ts: m.ts, kind: "chat", msg: m }`
   - `STAGE_ORDER` 中状态不为 `pending` 的每个 stage → `{ ts: stages[id].startedAt || fallback, kind: "stage", stageId: id }`
     - `startedAt` 为 0 时（旧快照）回退到一个稳定值，保持原 `STAGE_ORDER` 相对顺序（例如用 `index * 1` + 一个不大于任一 chat ts 的基准），避免老项目被打乱。
   - 按 `ts` 升序排序。

3. **单次 map 渲染**
   - `kind === "chat"`：
     - user 消息 → 现有的右侧气泡；
     - agent 消息 → `<ChatAgentMessage ...>`，`optionCards` 直接传 `m.optionCards ?? []`（**不再按 status 过滤**）——awaiting / 已采纳都在原位展示，由 `ChatOptionCard` 自己根据 status 切换样式（保持现有视觉：未确认显示选项 + Continue/Skip，已确认显示「✓ 已采纳，开始下一步」）。
   - `kind === "stage"`：保留现有 `STAGE_ORDER.map` 内对每个 stageId 的分支逻辑（structure → ScriptTable + StoryboardTable，wardrobe → WardrobePanel，等等），原样搬过来按 stageId 分派即可。

4. **`ApprovalChips` 与 `endRef`** 保持在时间线之后，位置不变。

5. **`stagesKey` 自动滚动 effect** 增加对 `chatLog` 已经存在的依赖；新增 `stages[id].startedAt` 进 `stagesKey`，确保新 stage 启动时能正确触发滚动（其它逻辑不动）。

## 兼容性 / 不动的地方

- `store.ts`、option card 的数据结构、`ChatOptionCard` 内部交互、`ChatAgentMessage`、stage 渲染细节均不改。
- 仅 `Workspace.tsx` 的 `inFlow` JSX 调整渲染顺序与过滤逻辑。
- 老项目快照里 stage 没有 `startedAt`（=0）的情况通过 fallback 保留原 STAGE_ORDER 顺序，不会出现错乱。

## 验收

- 输入 brief → 进入 running：refining brief 卡片出现在 SeriesBible/Selected Brief 之后、structure stage 之前。
- 点 Continue/Skip 后：该卡片**留在原位**显示「✓ 已采纳，开始下一步」，structure 阶段在它**下方**展开。
- 后续 `chat-director · 等待确认` / `image-edit` 等 agent 消息按时间戳穿插在对应 stage 之间，不再统一堆到最底部。
