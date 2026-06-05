
# 多任务并发 + 实时插话 + 暂停恢复 — 实施方案

> 范围确认：A3（完全可交互的并发任务）+ B3（运行中插话改方向 & 已完成阶段就地改写）+ C（输入框停止键改为「暂停/恢复」语义）。这是一次较大重构，下面给出最小可落地的拆分，分 4 期推进，每期单独可发布。

---

## 现状（关键事实）

`src/lib/sc/store.ts`（3842 行）是**单任务运行时**：
- 顶层字段共用：`phase / stages / chatLog / brief / assets / taskId / runId / timers / gate / softGate / rail / script / chatLog`
- 取消依赖全局 `runId`：所有 `schedule()` 闭包里都 `if (get().runId !== startedRunId) return`
- `restoreTask()` 用快照覆盖工作区 → 这就是为什么"正在生成中的项目不能回放"（A1 残留约束）
- `Sidebar.tsx` `disabled = isActive || isRunning`（明确硬禁用回放运行中任务）
- `CommandInput.tsx` 的方形按钮调用 `cancel()`，`cancel()` 直接 `phase=failed` + `persistCurrent("failed")` —— **没有真正的暂停/恢复**

---

## 第 1 期：把 store 拆成「每个任务一个 runtime」（A3 基础）

**目标**：同时存在 N 个独立的任务运行实例，互不干扰。

### 新增数据结构

```text
SCState {
  runtimes: Record<TaskId, TaskRuntime>   // 所有任务（运行/暂停/完成）
  activeTaskId: TaskId | null             // 当前工作区聚焦的任务
  ...全局字段（autoMode/viewMode/taskHistory/...）
}

TaskRuntime {
  taskId, taskTitle, taskKind, projectId
  phase: "thinking" | "running" | "paused" | "done" | "failed"
  brief, stages, assets, script, chatLog, gate, softGate, rail
  runId, timers, attachments
  createdAt, updatedAt
  pauseState?: PauseState   // 见第 3 期
}
```

### 改造要点
1. 所有读 `get().xxx` 的运行时字段统一改为 `get().runtimes[startedTaskId].xxx`；`schedule()` 闭包改为按 `taskId + runId` 双重判定。
2. `submit()` 不再清空当前工作区，而是新建一个 `TaskRuntime` 插入 `runtimes`，并把 `activeTaskId` 指过去（用户可以随时切回去）。
3. 暴露选择器：`useSC()` 默认返回 active runtime 的视图字段（保持现有组件 API 兼容），新增 `useTask(taskId)` 用于侧边栏/项目页查看任意任务。
4. `restoreTask(id)`：如果该 task 已在 `runtimes` 中，直接 `setActive(id)`（**不**清运行时）；否则按快照水合一个只读 runtime 后切过去。

### Sidebar 行为
- 去掉 `disabled = isRunning` 限制，运行中的任务点击 → `setActive(id)`，工作区实时跟随。
- 行尾保留 `<PulseDot />` 标识"正在跑"，并新增「⏸ / ▶」mini 按钮可在不切换的情况下暂停/恢复。

### 兼容/回归保护
- `restoreTask` 仍保留 `canRestoreTaskRecord` + `normalizeTaskRecord` 校验（Core 规则）。
- 项目详情页跳转回 `/` 工作区的现有逻辑不变。
- 时间格式化 mounted 守卫不动。

---

## 第 2 期：C — 输入框「暂停 / 恢复」按钮

**目标**：运行中点击方块 → **暂停**（不杀任务）；再点 → 从断点继续。

### 状态机
```text
running ──pause()──▶ paused ──resume()──▶ running
                       │
                       └── cancel()(长按或菜单) ──▶ failed
```

### store 新增
- `pauseTask(taskId)`：`clearTimers(taskId)`，记录 `pauseState = { atStageId, atScheduledFn, queuedChatBeforePause }`，设 `phase = "paused"`。**不**把 stage status 改为 recovering，**不** persist 为 failed。
- `resumeTask(taskId)`：从 `pauseState` 复原下一个调度点（每个阶段引擎都暴露"从某个阶段重入"入口；已有 `runLife / runDetails / runIntake / runKeyframe / runQC / runCast / runWardrobe / runStructure` 这些 stage-runner 函数，只需在 `pauseState` 里记录"上次跑到哪一步"+"下一步该调用哪个 runner"）。
- 现有 `cancel()` 保留，但 UI 默认按钮不再调用它（改成菜单里的"终止任务"）。

### CommandInput
- `isProcessing` 时按钮：
  - `phase === "paused"` → 显示 ▶（`Play`），点击 `resumeTask(activeTaskId)`
  - 其它（running/thinking/intake）→ 显示 ⏸（`Pause`），点击 `pauseTask(activeTaskId)`
- 长按 / 右键 / hover 出"终止任务"（调用旧 `cancel()`）。
- 暂停态下输入框**不再 disabled**，允许打字（为 B3 铺路）。

### 视觉
- 暂停态：阶段进度灯由"流动光"切到"静止描边"；`<PulseDot />` 改为半透明 + 不闪。
- 顶部状态条加一行 `已暂停 · 点击 ▶ 继续`（沿用现有 GeneratingPill 组件变体）。

---

## 第 3 期：B3-a — 运行中插话改方向

**目标**：用户在任务跑的中途从输入框发指令，下一个阶段自动消化新意图。

### 行为
1. 任务 `phase === "running" | "paused"` 时按 Enter → 走 `chatMessage(text)` 但带上 `intent: "interject"`。
2. 该消息进入 active runtime 的 `chatLog`，并写入 `runtime.pendingInterjections: string[]`。
3. 每个 stage-runner 在进入阶段开头读取并清空 `pendingInterjections`，把内容拼到本阶段的 prompt / brief 增量里（已有 `applyAgentPatch / AgentDirectives` 通道，可复用）。
4. 当前正在跑的阶段**不**中断；新指令在下一阶段生效（避免脏写）。如果用户希望立即生效，提示「⏸ 暂停后改写当前阶段」（衔接 B3-b）。

### UI 反馈
- 用户消息气泡右下角贴一个 `将在下一步生效` 的小 chip；下一阶段 runner 拿到后，把 chip 翻成 `已采纳`。

---

## 第 4 期：B3-b — 已完成阶段就地改写

**目标**：对某个已 `ready` 阶段（例如 `cast` 或 `keyframe`），用户给一句改写指令，只重跑该阶段，下游阶段做最小级联（标记 stale，让用户决定是否重跑）。

### 入口
- `StageRow.tsx` 已完成阶段尾部新增 `⟳ 改写本阶段` 按钮 → 弹出小输入框 → 调用 `rewriteStage(taskId, stageId, prompt)`。
- 同时在 `ChatAgentMessage` 上对应阶段的 agent 消息追加同款按钮。

### store 新增
- `rewriteStage(taskId, stageId, prompt)`：
  1. 把该 stage 从 ready 切回 `running`，summary 追加一行 `用户改写：xxx`；
  2. 调用对应的 `runXxx({ rewritePrompt })`；
  3. 下游所有 `STAGE_ORDER` 中位于其后的阶段：若已 `ready`，标记 `stale: true`（不自动重跑），UI 显示「上游已变更，点这里同步」。
- `StageState` 增加 `stale?: boolean` 字段。

### 约束
- `rewriteStage` 与运行中阶段冲突时（同阶段还在跑）→ 拒绝并提示先暂停。
- 不动用户未点名的其它模块（遵守 scope-discipline）。

---

## 验收用例（手动点过一遍才能算完成）

1. 同时开 3 个任务，sidebar 之间来回切，工作区内容、计时、stages 都各自独立、互不污染。
2. 任务 A 跑到 cast 时，点 ⏸ → stages 灯静止，CommandInput 变 ▶，输入框可编辑；点 ▶ → 从 cast 续跑且不重跑已 ready 的阶段。
3. 任务 A 跑到 wardrobe 时输入"主角衣服改成黑色风衣"→ 当前阶段不中断，进入 cast 阶段开头 summary 出现"用户插话：…"，cast 输出确实采纳。
4. 任务 A 已 done，点 keyframe 上 `⟳ 改写本阶段`，只重跑 keyframe，life / qc 标 stale，不自动重跑。
5. Sidebar 点正在跑的任务 → 直接切过去看实时输出（不再 disabled，不再清空当前工作区）。
6. 刷新页面：运行中的任务**保留 paused 标记**（持久化 pauseState），可恢复（最低要求：刷新后能继续看到任务，状态显示「已暂停 · 点击恢复」；真正"刷新后自动续跑"属 C3 范畴，本期不做）。
7. 回归：项目详情页恢复任务、时间格式化、SSR、`errorComponent`、Sidebar 恢复后跳回 `/` —— 全部不受影响。

---

## 风险与决策点

| 风险 | 处理 |
|---|---|
| store 拆分量大（3842 行），一次性改容易引入回归 | 分 4 期发布，每期独立可回滚；第 1 期先做 runtimes 容器和选择器，旧 stage-runner 函数最小化改造 |
| `restoreTask` 与"运行中切过去"语义冲突 | 运行中 task 走 `setActive`；归档 task 走"水合只读 runtime"，二者共用同一个 active 槽位 |
| 暂停断点续跑需要每个 stage-runner 暴露重入点 | 第 2 期顺手为 8 个 runner 加 `entrypoint` 参数，不改业务逻辑 |
| 插话 prompt 与 brief / agent patch 通道重叠 | 复用现有 `applyAgentPatch`，不新增并行链路 |
| 刷新后真正"后台续跑"需要把定时器搬到后端 | **不在本方案范围**（属 C3，需要 job queue） |

---

## 不改动的部分（遵守 scope-discipline）

- 项目详情页 UI、Sidebar 项目区 UI、登录 / SEO / 路由 head metadata
- `restoreTask` 的 normalize/校验链路、时间格式化的 mounted 守卫
- 现有 stage-runner 的业务实现（仅加 taskId 参数与 entrypoint 形参）
- 任何用户未点名的组件 / 样式 / 文案
