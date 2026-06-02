# 修复计划

## 1. 统一"运行中"阶段UI样式（问题1）

**问题**：`life` 等阶段失败/运行时只显示一条"该任务在运行阶段失败：未知错误"的文字（图1/图3），没有像图2 `Building the scene` / `Structuring the film` 那样的标准三段式结构。

**目标结构**（与图2完全一致）：
- 顶部：skill 行 `Used skill xxx · sub-skill`，右侧耗时 `1.1s / 7.9s`
- 中部：关键信息流（tool calls、thought、summary lines），用 `Thought 分镜方案 · A01 · 5s · …` 的样式
- 底部：流式中显示药丸 `Thinking…` / `Painting the frame…`（已在 `ChatAgentMessage` 中存在）

**改动**：
- `StageRow.tsx`：每个阶段标题行右侧增加 `durationMs` 累计耗时显示（取 `state.toolCalls` 最后一个 `done` 的 `startedAt + durationMs - 第一个 startedAt`）。
- `StageRow.tsx`：当 `status === 'running' | 'recovering'` 时，在 summary 列表下方追加底部"thinking"药丸（复用 `ChatAgentMessage` 里的 pill 样式，抽到独立 `<StageThinkingPill verb=… />` 组件）。
- `StageRow.tsx`：`status === 'failed'` 时在 summary 下方显示 `errorMessage`（来自 `state.errorMessage`，需在 `StageState` 中加该字段；store 在 `appendSummary` 失败时同步写入）并提供 **"重试该阶段"** chip（已有 `retryStage(id)`），不再依赖外层 ChatAgentMessage 的 `整任务重跑` 按钮。
- 移除 chat 流里"该任务在运行阶段失败"的兜底文本（store.ts `runLife`/`runDetails` 失败分支里推到 chatLog 的 agent 消息只保留 `重试该阶段` 行动，不再写"未知错误"的散文）。

## 2. 视频容器始终渲染 + 单段重做（问题2）

**问题**：失败时图3里既看不到 V01…V0N 视频卡，又只剩"整任务重跑"。

**改动**：
- `Workspace.tsx` 的 `life` 阶段分支：把 `v01 && <AssetCard asset={v01} />` 替换为渲染 **所有** `stageId==='life'` 的 asset（`Queued/Processing/Ready/Failed` 都渲染），用网格布局。
- `AssetCard.tsx`：当 `status === 'Failed'` 时显示错误徽章 + `重做该片段` 按钮（调用现有 `retryAsset(asset.id)`）；`Queued/Processing` 显示进度占位（poster + loader 浮层）。
- `store.ts` `retryAsset`：`asset.stageId === 'life'` 分支当前直接整段重跑 `runLife`，改为：只重跑该单段（提取 `runLifeSegment(asset)` 子函数，复用 wardrobe refs + 该段 prompt/keyframe）。

## 3. Intake 新增"画风"问题 + 接入真实生成（问题3）

**改动 `intake-engine.ts`**：
- 新增第 5 个问题 `visualStyle`，选项：`2D 动画`、`3D / CG`、`真人实拍`、`毛毡风`、`像素风`、`Others…`。
- `inferIntake()` 用正则从 prompt 中识别 30秒/16:9/毛毡风/连续剧 等关键字，写入 `defaults`：
  - `format` 时长/比例匹配："30秒/30s"→`30s · 9:16`、"16:9"→对应 `· 16:9` 项；若用户给的组合不在预置列表，则**追加**一个新选项 `"<时长> · <比例>"` 并选中（用 `intakeCustoms` 已有机制）。
  - `adType`：现有逻辑保留，扩展"连续剧"→`Series · Episodes`。
  - `visualStyle`：扫描"毛毡/felt/像素/pixel/2D/3D/真人"等关键字命中即选中；未命中默认空（强制用户选）。
- `IntakeCard.tsx`：`ORDER` 加 `visualStyle`，`titles/shortLabels` 同步。

**接入真实后端**（让画风真的影响图片）：
- `Brief` 类型加 `visualStyle?: string`（`types.ts`）。
- `IntakeCard.onContinue` 写入。
- `script.functions.ts` `GenerateScriptInput` 增加 `visualStyle`，注入到系统 prompt：要求所有 shots 的英文 prompt 以 `Style: <visualStyle 英文映射>` 开头。
- `store.ts` runWardrobe/runPaint 调 `streamGenerateImage` 时，在 prompt 前拼接 style 关键词（`felt-craft style / pixel-art 8-bit / 2D anime / photorealistic live-action / 3D CGI`）。

## 4. Intake 选项放在剧本生成"上方"（问题4）

**问题**：上次只挪了 `optionCards`（chat 内卡片），但 IntakeCard 仍发生在剧本生成之前的独立 `phase==='intake'`，用户希望像图4那样以"卡片"形式紧贴在 `Structuring the film` 上方（图5）；并且允许在剧本已生成后回头修改这些选项。

**改动**：
- 不再用独立 `phase==='intake'` 全屏渲染。`submit()` 进入 `running` 后立刻：
  1. 在 `chatLog` 推一个 agent 消息 `optionCards: [intakeCard]`（5 题用现有 `ChatOptionCard` 渲染）；
  2. 同时启动 `runScene` 流程，但 `runStructure` 必须等待该 optionCard `status === 'submitted' | 'skipped'`（auto 模式 15s 自动采用 defaults）。
- `Workspace.tsx`：现有"refining brief option cards"已渲染在 `STAGE_ORDER.map` 之上，无需移动；只需确保 intake 也走同一路径。
- 删掉 `phase === 'intake'` 分支的全屏 IntakeCard（或保留作为兜底）。

## 技术要点

- `StageState` 增字段：`errorMessage?: string`。
- 新组件：`src/components/sc/StageThinkingPill.tsx`、`src/components/sc/StageDurationBadge.tsx`。
- `store.ts` 拆 `runLifeSegment(asset, opts)`，`retryAsset` 对 life 段调用它。
- `intake-engine.ts` 增 `parseFormatFromPrompt(prompt)` 提取 `{ seconds, ratio }` 返回。

## 待修改文件

- `src/lib/sc/types.ts`（StageState.errorMessage、Brief.visualStyle、StageId 不变）
- `src/lib/sc/intake-engine.ts`（新 visualStyle、parseFormat、关键字检测）
- `src/lib/sc/store.ts`（intake 改为 optionCard、life 段拆分/重试、失败 chat 文案、画风传参）
- `src/lib/script.functions.ts`（visualStyle 入参）
- `src/components/sc/Workspace.tsx`（life 网格渲染所有段；移除 intake 全屏分支）
- `src/components/sc/StageRow.tsx`（耗时徽章、底部 thinking pill、failed errorMessage）
- `src/components/sc/AssetCard.tsx`（Queued/Processing 占位、失败重试按钮）
- `src/components/sc/IntakeCard.tsx`（新增 visualStyle 问题，或转为 optionCard 形态）
- 新增 `StageThinkingPill.tsx`、`StageDurationBadge.tsx`
