## 现象与根因

参考截图中带绿色圆点的项目（status=running）无法点击进入，且即便进入也看不到"完整无省略"的流程。代码层面的两个根因：

### 1. 入口被显式禁用
- `src/components/sc/Sidebar.tsx` L334 `const disabled = isActive || isRunning;` — 只要任务状态是 running，整行按钮就是 `disabled`，鼠标变成"禁止"光标，`onClick` 直接 return；hover 上去 title 还会显示"该任务正在运行，无法回放"。
- `src/routes/projects.$projectId.tsx` L189 `handleOpenTask` 又走了一次 `canRestoreTaskRecord` 兜底；当前还没有任何阶段产出的 running 任务，`canRestoreTaskRecord` 会返回 false（没 title 也没 assets/snapshots），项目详情卡片点了也是哑的。

### 2. 流程被"自动折叠 + 单行截断"省略
- `src/lib/sc/store.ts` 里每个阶段跑完都 `collapseAfter(...)` 把 `expanded` 设回 false（出现在 scene/wardrobe/cast/paint/qc/life/details 等多处）。
- `src/components/sc/StageRow.tsx` 在 `expanded === false` 时只渲染 `state.summary` 最后一行，并加 `truncate` —— 这就是用户看到的"…"省略效果。
- 即便点进 running 任务，前面已完成的阶段也已经被自动折叠并截断了。

## 改动

只做两件事，都是前端/状态层，不动后端：

### A. 让 running 任务可点击

`src/components/sc/Sidebar.tsx`
- `disabled` 改为只看 `isActive`（当前已在该任务上的才禁用）。
- `onClick` 分支：
  - 如果点击的是"当前内存中的活动任务"（`t.id === useSC.getState().taskId`），不调 `restoreTask`，直接 `navigate({ to: "/" })`，避免打断正在跑的状态机。
  - 否则维持现有的 `canRestoreTaskRecord` + `restoreTask` 路径；不可恢复时弹一条 toast 提示"该任务暂无可回放的快照"而不是静默 `return`。
- `title` / 视觉态：running 时改为"查看当前进度"，去掉 `cursor-not-allowed`。

`src/routes/projects.$projectId.tsx`
- `handleOpenTask` 同样加上"是否是当前活动任务"分支：是 → 直接 `navigate('/')`；否 → 沿用 canRestore 逻辑，并在不可恢复时弹 toast。
- 任务卡片上 running 状态保留琥珀色徽标，但 hover 文案改为"查看进度"。

### B. 默认展示完整流程，不再自动折叠

`src/lib/sc/store.ts`
- 在 store 顶层加一个常量 `AUTO_COLLAPSE_STAGES = false`，把 `collapseAfter` 内部改为：当该开关为 false 时直接 no-op。这样所有阶段 `expanded` 始终保持为 true，从 scene 一路到 details 都会完整可见，包括 toolCalls / thoughts / summary 全量；`toggleStage` 仍允许用户手动折叠某一段。
- `restoreTask` 已经把恢复出来的阶段 `expanded` 设为 true，无需改动。

`src/components/sc/StageRow.tsx`
- 折叠态下的 summary 行去掉 `truncate`，改为 `whitespace-pre-wrap break-words` —— 即使用户手动折叠，最后一行也不再被裁成"…"。

## 技术细节

```text
点击 running 任务的判定顺序
┌─────────────────────────────────────────────┐
│ t.id === useSC.taskId ?                     │
│   是 → navigate('/')   // 直接回到正在跑的工作区
│   否 → canRestoreTaskRecord(t) ?            │
│         是 → restoreTask + navigate('/')    │
│         否 → toast.info('暂无可回放的快照') │
└─────────────────────────────────────────────┘
```

只触碰：
- `src/components/sc/Sidebar.tsx`
- `src/routes/projects.$projectId.tsx`
- `src/lib/sc/store.ts`（仅 `collapseAfter` 与新增开关）
- `src/components/sc/StageRow.tsx`（仅折叠态文本样式）

不动后端、不动 WAN 流程、不重构任何其它模块或样式。
