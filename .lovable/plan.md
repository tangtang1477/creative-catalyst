## 修复内容

### 1. 侧边栏「我的项目」标题去掉 FolderPlus 图标

文件：`src/components/sc/Sidebar.tsx`

- 删除「我的项目」文字左侧的 `<FolderPlus>`，只保留文字本身和右侧的折叠箭头。
- 下方的「新项目」入口行保留 `<FolderPlus>` 图标（避免重复）。

### 2. 点击项目能真正进入对应内容（修复匹配逻辑）

当前 `enterProject` 用 `taskHistory.find(t => t.title === proj.name)` 匹配，但任务标题是从 prompt 自动推断的，几乎永远不等于项目名，所以「永远找不到」走 `reset` 分支 → 表现为「点了没反应」。

修改：用 `projectId` 真实建立关联。

文件：`src/lib/sc/types.ts`、`src/lib/sc/store.ts`、`src/components/sc/Sidebar.tsx`

1. `TaskRecord` 新增可选字段 `projectId?: string | null`。
2. `persistCurrent` 写入 record 时读取 `useProjects.getState().currentProjectId` 一并存进 `projectId`。
3. `enterProject(projectId)`：
   - `setCurrentProject(projectId)`
   - 在 `taskHistory` 中按 `t.projectId === projectId` 匹配最近一条；找到 → `restoreTask(id)`；找不到 → `reset({ fromUserAction: true })` 进入空白工作区（保留项目上下文，让 ProjectGuideCard 引导用户开始第一集）。
4. `restoreTask` 内部在恢复时同步调用 `useProjects.getState().setCurrentProject(rec.projectId ?? null)`，保证侧边栏 active 高亮 + 头部上下文跟随。
5. Sidebar 的「我的项目」当前项目高亮逻辑沿用 `currentProjectId`。

### 3. 积分总额度 = 200、单次消耗统一 5、ring 与 hover 完全一致

文件：`src/lib/credits.functions.ts`、`src/lib/sc/credits-store.ts`、`src/lib/sc/store.ts`、`src/components/sc/credits/CreditRing.tsx`、`src/components/sc/UserHoverCard.tsx`

1. **总额度 200**：
   - `credits.functions.ts` 的 `CONSUME_TOTAL` 改为 `200`。
   - `credits-store.ts` 的 `load()` 默认值改为 `{ total: 200, used: 0 }`；新增迁移：若 localStorage 中 `total < 200`，强制覆盖为 200（清掉旧的 100/42 mock 数据）。
2. **统一 5 积分**：把 `store.ts` 中所有 `consume(stage, label, N, taskId)` 调用的 `N` 改为 `5`（涉及 scene/structure/wardrobe/paint/life/details 以及重试入口共 10 处）；`VIDEO_COST_PER_SEG` 也改为 5。
3. **每次消耗显式提示**：`notifyConsume` 文案改为更直白的 `本次消耗 5 积分 · 剩余 X 积分`（描述行补「阶段 · {stage}」），保留 350ms 同阶段聚合避免连发刷屏。
4. **圆环与 hover 卡片读同一数据源**：
   - `CreditRing`：已用 `remaining/total`，保留；本次只确认在 `topUp/consume` 后 `pulseId` 变化 → 触发 flash。
   - `CreditsHoverPanel` 顶部那一行 `X left` 与 20 个 dot 也读 `remaining/total`（已是），现在 `total=200` 后 dot 粒度变为 `200/20 = 10 积分/格`，与圆环视觉口径一致。
   - `UserHoverCard` 头部 3px 条已是 `pctRemain`，保留。
5. 充值/消耗后 `syncFromBackend` 已存在；本次只确保 `topUp` 成功后 `pulseId++`（已有），让圆环立即闪一下表示金额变化。

### 涉及文件汇总

- `src/components/sc/Sidebar.tsx` — 去掉「我的项目」前的 FolderPlus 图标
- `src/lib/sc/types.ts` — `TaskRecord` 增加 `projectId`
- `src/lib/sc/store.ts` — `persistCurrent` 写 projectId、`enterProject` 改用 projectId 匹配、`restoreTask` 同步 currentProjectId、所有 `consume` 改为 5、`VIDEO_COST_PER_SEG=5`
- `src/lib/credits.functions.ts` — `CONSUME_TOTAL = 200`
- `src/lib/sc/credits-store.ts` — 默认 total=200、旧值迁移、toast 文案改为「本次消耗 X · 剩余 Y」
- `src/components/sc/credits/CreditRing.tsx`、`src/components/sc/UserHoverCard.tsx` — 仅口径核对，不改逻辑（数据源已一致）
