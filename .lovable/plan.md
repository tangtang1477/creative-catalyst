
# 计划：Gallery 版本管理 + 历史任务完整回放

## 1. Gallery 分类 + 版本切换 UI（MediaRail）

**目标**：素材增多时方便导航，能查看任何一次修改的历史版本（不覆盖原素材，前面已落库到 `Asset.versions`）。

### 1.1 新分类维度
- 顶部 filter chips 从「all / image / video」改为两层：
  - 第一层（类型）：All · Wardrobe & Props · Keyframes · Videos · Fix history
  - 映射规则：
    - `Wardrobe & Props` = `stageId === "wardrobe"`
    - `Keyframes` = `stageId === "paint"`（kind=image）
    - `Videos` = `kind === "video"`
    - `Fix history` = `versions?.length >= 2` 的素材（即被修过的）
- 在每个分组（已有的 `Group`/`EpisodeGrid`/`EpisodeList`）头部继续展示数量。

### 1.2 版本徽章
- `AssetThumbCard` 与 `AssetCard` 缩略图右下角：当 `versions?.length >= 2` 时叠一个 `v{n}` 小徽章（与失败/状态徽章错位避免重叠）。

### 1.3 版本切换抽屉（VersionDrawer）
- 新建 `src/components/sc/VersionDrawer.tsx`：基于 shadcn `Sheet`（右侧 480px）。
- 在 `AssetCard` 与 `AssetThumbCard` 上长按或菜单 `…` 增加「查看版本历史」入口；当 `versions?.length >= 2` 才显示。
- 抽屉内容：
  - 顶部素材标签 + 当前 url 缩略图。
  - 列表纵向时间线：每行 = 一个版本（thumb + `source` 标签 + 相对时间 + note）。
  - 点击某一版本 → 调用新 store action `setActiveVersion(assetId, versionIndex)`：把选中版本上移为当前 `url`，原当前推入 `versions`（保持不丢失，记为 `manual-revert`）。
  - 右上角「下载本版本」直接 `<a download>`。

### 1.4 store 改动（src/lib/sc/store.ts）
- 新增 `setActiveVersion(assetId, index)`：交换 active url，并 push 当前 url 到版本数组、标记 source=`manual-revert`。
- 类型：`AssetVersion.source` 增加 `"manual-revert"`。

## 2. 历史任务完整回放 + 失败重做 agent 消息

**目标**：从 Sidebar 进入历史任务时，能看到当时完整的 stage 内容（脚本/分镜/wardrobe/qc/v01 视频），而不是折叠后的纯摘要；失败任务自动弹一条 agent 消息询问是否重做。

### 2.1 删除「isRestored 走简化分支」
- `src/components/sc/Workspace.tsx` 第 41 行 `isRestored` 判断与第 182-188 的简化分支去掉。
- 让历史任务也走正常的 `STAGE_ORDER.map` 渲染（ScriptTable / WardrobePanel / QCPanel / AssetCard(v01) / QualityCheck）。
- 为此 `restoreTask` 必须把以下运行时数据全部恢复：
  - `script`（已存在 `TaskRecord.script`，restoreTask 里 `set` 中加入 `script: rec.script`）
  - 每个 stage 的 `toolCalls` / `thoughts`（从 `stageSnapshots` 恢复，不再只读 `stageSummaries`）
  - `stages[id].expanded` 默认 `true`，让回放时所有内容默认展开方便查看
- 由于 WardrobePanel / QCPanel 依赖 `assets`（已恢复）+ store 内的 wardrobe/qc 派生状态：检查 `WardrobePanel.tsx` 与 `QCPanel.tsx` 是否还依赖运行时临时字段（如 qc thoughts、qc issues 数组）；若是，则在 `TaskRecord` 增加一个 `qcSnapshot?` 字段并在 `runQC` 完成时持久化，restoreTask 写回 store。

### 2.2 错误降级（保留稳定性）
- 保留 `StageBoundary` 包裹（已存在），任一 stage 渲染崩溃时只降级该 stage 为「⚠️ 此步骤的回放数据不完整」并附带「重做这一步」按钮（调用 `retryStage(id)`）。

### 2.3 失败任务智能询问
- `restoreTask` 末尾：若 `rec.status === "failed"`，往 `chatLog` 注入一条 agent 消息：
  - 文本：`「该任务在 {失败 stage 标签} 失败：{failureReason}。要我重做这一步，还是从头再跑一遍？」`
  - 同时在消息后追加两个 chip 按钮（复用 `ApprovalChips` 的样式或新建 `RetryChips`）：
    - 「重做此步」→ `retryStage(failedStageId)`
    - 「整任务重跑」→ `submit(brief.prompt)`（或 `runScene` 起点）
  - 实现方式：扩展 `chatLog` 消息类型 `actions?: { label, onClickAction: "retry-stage" | "rerun-all" }[]`，在 Workspace 的 agent 消息渲染分支里检测并渲染 chips。

### 2.4 agent 消息容器样式（已在上轮调整，本轮校验）
- Workspace.tsx 304-312：保持「无边框 + 头像有 ring」状态；带 actions 时 chips 排在消息下方一行。

## 3. 重跑一次 Seedance 验证（无代码改动）
- 上一轮已修复 duration 白名单（5/10s）。本轮触发：用户在 UI 上重新提交一个任务，观察 life 阶段是否成功提交（不再是 `InvalidParameter ... duration`）。若仍失败，捕获新的错误码与原始 payload 继续排查。

## 技术清单

**新文件**
- `src/components/sc/VersionDrawer.tsx`

**修改文件**
- `src/lib/sc/types.ts`：`AssetVersion.source` 加 `manual-revert`；`TaskRecord` 加可选 `qcSnapshot`；`ChatMessage` 加 `actions?`。
- `src/lib/sc/store.ts`：
  - `setActiveVersion` action
  - `restoreTask` 改为从 `stageSnapshots` 完整恢复 `toolCalls/thoughts/expanded`，并恢复 `script`、`qcSnapshot`；失败时注入 agent 消息 + actions
  - `runQC` 完成处 `persistCurrent` 时把 qc 派生数据写入 `qcSnapshot`
- `src/components/sc/MediaRail.tsx`：新的分类 filter（含「Fix history」）+ 版本徽章 + 「查看版本」入口
- `src/components/sc/AssetCard.tsx` & `AssetThumbCard.tsx`：版本徽章 + `…` 菜单项「版本历史」
- `src/components/sc/Workspace.tsx`：删除 `isRestored` 简化分支；agent 消息渲染支持 `actions` chips
- `src/components/sc/StageBoundary.tsx`：降级 UI 增加「重做此步」按钮

**不动**
- 数据库结构（版本数据已在 client `Asset.versions`，无需新表）
- credits / seedance / qc 业务逻辑

## 验收
1. 历史任务点开能看到完整 ScriptTable / WardrobePanel / QCPanel / v01 视频，并能展开 toolCalls 与 thoughts。
2. 失败的历史任务自动出现 agent 卡片 + 「重做此步 / 整任务重跑」按钮，点击生效。
3. Gallery 顶部有 5 类 chips，每个被修过的素材右下角显示 `v2`/`v3` 徽章。
4. 点击素材 `…` → 版本历史能切换到旧版本，原版本进入历史栈，不丢失。
5. 重新触发任务，Seedance 提交成功，life 阶段不再因 duration 失败。
