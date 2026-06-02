## 修复 4 个问题

### 1. 侧边栏「我的项目」点击无效 + 首页缺少新建项目入口

**问题**：`Sidebar.tsx` 第 251-263 的项目行只是 `<div>`，没有 onClick；点项目无反应。空状态 Workspace 首页也没有「+ 新建项目」的入口卡片。

**改动**：
- `src/components/sc/Sidebar.tsx`：项目行改为 `<button>`，`onClick` 调用 `useProjects.setCurrentProject(p.id)` 并恢复该项目下最近的一个任务（用 `taskHistory` 找匹配 `projectId` 的最新任务并调用 `restoreTask`；若无则保持当前 phase 不变只切换 currentProjectId 即可，让 `ProjectGuideCard` 显示「已切换到 XX」）。
- `src/components/sc/Workspace.tsx`：在 `phase === "empty"` 块里、`SuggestionChips` 下方加一个紧凑的「📁 我的项目」横向条，列出最近 3 个项目卡（点卡进入对应项目），最右侧一个「+ 新建项目」按钮（调用 `openCreateProject(null)`）。无项目时显示一个「+ 创建第一个项目」按钮。

### 2. 「视频准备做多少集？」仅在 Series 时出现

**问题**：`src/routes/api/chat-stream.ts` 第 83 行 `preflight-options` system prompt 把「第 1 题=时长/集数」写死，无论 adType 都问集数。

**改动**：
- `src/routes/api/chat-stream.ts`：在 preflight 分支中读取 `ctx.brief.adType`，若**不包含** `Series` / `剧集` / `连续剧`，把第 1 题指示改成「第 1 题=视频时长（单集/单条），禁止提及集数/多少集/系列」；若是 Series，保持现有「时长 + 集数」。同时在 `ctxLines` 显式追加一行 `内容类型：非连续剧（禁止问集数）` 或 `内容类型：连续剧（可问集数）`，强化约束。

### 3. 识别到上传素材时默认选中「使用上传素材」

**问题**：`IntakeCard.tsx` 用 `inferIntake(prompt)` 计算 defaults，未考虑 attachments；当前总是默认「自动生成角色/场景」。

**改动**：
- `src/lib/sc/intake-engine.ts`：`inferIntake` 增加可选第二参数 `{ hasAttachments?: boolean }`；当为 true 时 `defaults.visualSource = "使用上传素材"`。
- `src/components/sc/IntakeCard.tsx`：调用处改为 `inferIntake(brief?.prompt ?? "", { hasAttachments: (useSC.getState().attachments?.length ?? 0) > 0 })`，并把 attachments 加入 useMemo 依赖。

### 4. 单图重试不应重做所有图

**问题**：`store.ts` 第 2270-2278 行，`retryAsset` 在 `paint` / `wardrobe` 阶段直接调 `retryStage` 整批重跑。

**改动**：在 `src/lib/sc/store.ts` 内新增两个函数：

- `runPaintShot(assetId)`：从 `state.script.shots` 找出对应分镜（用 asset.id 匹配 shot id），按 `runPaint` 内同一套 prompt 构造（含 styleFragment + briefPrompt + KEYFRAME_PROMPT_DETAIL），调用 `streamGenerateImage` + `uploadBase64Image`，把当前 url 通过 `updateAssetWithVersion` 推到 versions 历史，并把新 url 写回该资产。失败时只把该资产标记 Failed，不影响其它资产；成功时不触发 collapseAfter / openGate。
- `runWardrobeAsset(assetId)`：同思路，根据 `asset.id` 是 `W*` 还是 `P*` 复用原 prompt 逻辑（hero / supporting / prop），单图重试。

然后把 `retryAsset` 的 paint / wardrobe 分支改为分别调用 `runPaintShot(assetId)` / `runWardrobeAsset(assetId)`，不再委托给 `retryStage`。重试前先 `ensureUserId()`，未登录则把单个资产标记 Failed 并提示，不影响其它资产或 stage 状态。

### 不动的部分
- `routeTree.gen.ts`、Supabase 客户端、types.ts 不动。
- 数据库无变更。
- 整体视觉、stage UI、ChatOptionCard 渲染顺序不变。
