
## 本轮改动计划（基于 AI Video Studio 现状）

### 1. 鼠标光圈继续缩小（视觉）

`src/components/sc/DotGridBackground.tsx`：
- `glowRadius` 120 → 80
- 光下半径增量 0.9 → 0.7、不透明度叠加 0.45 → 0.35
- `spacing` 14 → 12，让点更密但更轻
- mask 收紧至 40%

### 2. 画布预览模式（Canvas View）

新增模式切换：在 `MediaRail` / 顶部右上 Gallery 按钮左侧加一个图标按钮（`LayoutGrid` 列表视图 / `Workflow` 画布视图，二选一切换）。

参考 AI Video Weaver `src/components/canvas/Canvas.tsx` 的节点画布风格，**仅做视图层映射**，流程/数据完全沿用现有 store：

- 新建 `src/components/sc/canvas/CanvasView.tsx` — 容器：DotGrid 背景 + pan/zoom 容器（滚轮缩放、左键拖动）
- 新建 `src/components/sc/canvas/StageNode.tsx` — 每个阶段（Building / Structuring / Wardrobe / Paint / QC / Life / Details）显示为一个节点卡，复用 `StageRow` 内的标题、状态、流式 summary
- 新建 `src/components/sc/canvas/AssetNode.tsx` — 资产（A01 / C01 / E01 / P01 / V01 / wardrobe）以缩略图卡片节点呈现
- 新建 `src/components/sc/canvas/NodeEdges.tsx` — SVG 曲线连接 Stage→Asset、Stage→Stage
- store 新增 `viewMode: 'list' | 'canvas'` + `setViewMode`，默认 list；切换按钮在 `Workspace.tsx` 顶栏
- 节点位置按阶段序号 + 资产排布生成静态布局（不做拖拽编辑），避免引入复杂状态

### 3. 真实 Loading 效果 + 思考过程展开/收起

每个阶段 running 状态下，summary 区域上方插入一行"工具调用"提示，类似 Claude/Cursor 的 tool-use 行：

```
⏳ Using skill · video-script-writer  (1.2s)
⏳ Calling tool · text-to-image · MovieFlow  (2.4s)
⏳ Calling tool · qc-consistency-checker  (3.1s)
```

- 新建 `src/components/sc/ToolCallLine.tsx` — 单行：spinner + skill/tool 名 + 实时计时 + 完成后变 ✓
- 新建 `src/components/sc/ThinkingBlock.tsx` — 可折叠"思考过程"块（默认收起，标题 `Thought for 4.2s · 展开`），内部为多段流式段落
- 在 `Structuring`（剧本/分镜）阶段，当 Paint 已产出图片素材后，思考块支持渲染**素材缩略图行**（C01/E01/P01/wardrobe 小图），表示"基于以下素材生成分镜"
- store: 给 `StageState` 增加 `toolCalls: { id; label; status: 'running'|'done'; durationMs }[]` 和 `thoughts: { id; text; thumbs?: string[] }[]`
- 现有 `streamLines` 拓展为先 push toolCall → 等待 → 完成 → 再 push summary

### 4. 模式简化为 Auto / Confirm

- `types.ts`：`AutoMode = 'auto' | 'confirm'`（删除 blocker/guided/strict）
- `AutoRunMenu.tsx` 改为参考图 2 的两项：
  - ✓ Auto-run without asking（默认）
  - 🤚 Confirm before running
  - 触发按钮：选中 auto 显示 "Auto Run"，选中 confirm 显示 "Confirm"
- `store.ts`：`isContinuousMode = autoMode === 'auto'`；删掉 4-mode 分支

### 5. 流程新增两个阶段

`types.ts` `StageId` 扩展为：
```
scene → structure → wardrobe(新) → paint → qc(新) → life → details
```

#### 5.1 Wardrobe（服装/道具）

`STAGE_LABEL.wardrobe = "Styling wardrobe & props"`

- 在 `structure` 完成后、`paint` 之前运行
- 生成 2-4 个素材卡：`W01` 主角服装、`W02` 配角服装、`P01` 关键道具，状态走 Queued→Processing→Ready
- summary 强调"匹配 1920s 民国 / 现代都市 / 赛博朋克"等年代感，让用户判断是否符合背景
- confirm 模式下完成后弹 gate `wardrobe`，提供"采纳 / 调整"chip

#### 5.2 QC 自查（在 life 之前？不，按用户原文：在分镜生成后合并完整视频之前）

实际语义：分镜 = paint 的关键帧序列，合并完整视频 = life 的 V01。所以 `qc` 阶段插在 `paint` 之后、`life` 之前。

`STAGE_LABEL.qc = "Self-check & consistency"`

QC 阶段展示前端可见的检查项列表（流式打勾）：
- 角色一致性（C01 跨镜对比）
- 场景一致性（E01 风格统一）
- 道具/服装连贯性（W01/W02/P01）
- 故事连贯性（剧本节拍 vs 关键帧）
- 幻觉/事实性检测
- 法务/合规扫描

UI：
- 新建 `src/components/sc/QCPanel.tsx` — 表格：检查项 / 进度条 / 结果（✓ Pass / ⚠ Issue）
- 检查结束总结："发现 2 处问题" 或 "全部通过"
- 若有问题：渲染"修改建议"卡片 → 调用 mock 的"快模型重生成"（`updateAsset` 替换缩略图，文案标注 `Fast model · 0 credits · Preview`）
- 弹 gate `qc-fix`：chips `按建议调整` / `保持原样`
- 若用户 20s 无操作（auto 模式）自动按建议调整

### 6. Auto 模式 20s 自动推进

新增通用"软 gate"机制，应用于所有非首屏必选项的确认点（script / wardrobe / keyframe / qc-fix）：

- store: `gate` 设置时同时 `gateAutoAt = Date.now() + 20000`、`gateDefaultAction: () => void`
- 仅当 `autoMode === 'auto'` 时启动 20s 倒计时
- 新建 `src/components/sc/AutoAdvanceTip.tsx` — 在 gate 卡片底部展示："20s 后将自动按推荐继续 · 倒计时 18s · [立即继续] [我要确认]"
- 倒计时归零执行 `gateDefaultAction`；用户任意输入/点击则取消倒计时
- intake 阶段（视频类型等首屏必选项）**不启用**软 gate

### 7. 批量修改素材

`MediaRail` / `AssetTable` 新增多选模式：

- 缩略图左上角 hover 出现 checkbox；顶部出现工具条："已选 3 项 · 批量修改 / 取消"
- 点"批量修改"弹 `BatchEditDialog`（新建 `src/components/sc/BatchEditDialog.tsx`）：textarea 输入统一指令（如"全部换成夜景"），提交后：
- store 新增 `batchEditAssets(ids: string[], instruction: string)`：选中资产全部进入 `Recovering`→`Processing`→`Ready`，同时在 `details` 阶段追加流式 ThinkingBlock + ToolCallLine（同第 3 点的样式），让用户看到每个素材的重生成过程
- 复用 QC 同款"快模型 / 0 credits"标注

---

## 文件清单

**新建**
- `src/components/sc/canvas/CanvasView.tsx`
- `src/components/sc/canvas/StageNode.tsx`
- `src/components/sc/canvas/AssetNode.tsx`
- `src/components/sc/canvas/NodeEdges.tsx`
- `src/components/sc/canvas/CanvasDotGrid.tsx`（画布内更密的点阵，独立于全局背景）
- `src/components/sc/ToolCallLine.tsx`
- `src/components/sc/ThinkingBlock.tsx`
- `src/components/sc/QCPanel.tsx`
- `src/components/sc/AutoAdvanceTip.tsx`
- `src/components/sc/BatchEditDialog.tsx`
- `src/components/sc/ViewModeToggle.tsx`

**修改**
- `src/components/sc/DotGridBackground.tsx` — 光圈再缩
- `src/components/sc/AutoRunMenu.tsx` — 简化为 2 项
- `src/components/sc/Workspace.tsx` — 顶栏接入 ViewModeToggle，根据 viewMode 切换 list/canvas
- `src/components/sc/StageRow.tsx` — 嵌入 ToolCallLine / ThinkingBlock
- `src/components/sc/MediaRail.tsx` — 多选 + 批量按钮
- `src/components/sc/ApprovalChips.tsx` — 集成 AutoAdvanceTip
- `src/lib/sc/types.ts` — `StageId` 加 `wardrobe`/`qc`；`AutoMode` 收敛为 2 项；`StageState` 加 `toolCalls`/`thoughts`；新增 `Gate` 值 `wardrobe`/`qc-fix`
- `src/lib/sc/store.ts` — 6 项：viewMode、新阶段 runner、软 gate 倒计时、tool-call streaming、QC 检查、批量修改

## 验收点

1. 鼠标光晕明显更小、更柔。
2. 进入生成流程后顶栏出现"画布预览"切换按钮，切到 canvas 显示节点画布版，数据同步。
3. 每个阶段 running 时展示 `Using skill / Calling tool` 行 + 计时；剧本阶段思考块可展开，里面带服装/角色缩略图。
4. AutoRunMenu 只有 Auto-run / Confirm 两项；触发按钮文案随之变化。
5. 流程顺序：scene → structure → wardrobe → paint → qc → life → details；wardrobe 出现服装/道具卡；qc 出现检查清单流式打勾 + 总结 + 建议（快模型 0 credits 重生成）。
6. Auto 模式下任何中途 gate 自动 20s 倒计时推进，UI 有提示和"立即继续/我要确认"。
7. MediaRail 可多选 → 批量修改对话框 → 在 details 阶段流式回放修改过程。
