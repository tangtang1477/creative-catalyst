## 修复计划

### 1. 历史任务恢复后输出不完整
**问题**：从 Sidebar 点击历史 task 进入后，时间线只剩 stage 卡片的摘要/缩略信息（Building the scene、Structuring the film 折叠态），而不是当初生成时看到的完整内容（完整 brief 卡片、完整脚本表格、完整工具调用、完整 thought 全文、完整分镜表）。

**根因**：`restoreTask` / `normalizeTaskRecord`（`src/lib/sc/store.ts`）在写回 stageSnapshots 时只保留了 `summary` / `toolCalls` 的精简字段，没有把原始 `thoughts` 全文、`script`、`brief` 选项确认消息、option card 提交记录、`messages` 时间线完整恢复；同时 `Workspace.tsx` 在 hydrated 后只按当前 stage 状态渲染，没把历史 `messages`（含 brief 摘要、脚本表、用户/agent 对话）按原顺序回放。

**改动范围**（只动这条恢复链路，不动正在运行态逻辑）：
- `src/lib/sc/store.ts`：扩展 `normalizeTaskRecord` 把 `messages`、`script`、`brief`、`thoughts` 全文、`optionCards` 提交状态完整保留；`restoreTask` 不再丢弃这些字段。
- `src/lib/sc/types.ts`：如缺字段则在 `TaskRecord` 上补齐（仅追加，不改既有字段语义）。
- `src/components/sc/Workspace.tsx`：恢复模式下按 `messages` 原始顺序渲染，stage 默认展开到与原始输出一致的层级（脚本表、thought 全文可见）。
- `src/components/sc/StageRow.tsx`：恢复态下不强制折叠，保留原 `expanded` 状态。

### 2. Canvas 改为纯素材视图（参考图二）
**问题**：当前 `CanvasView.tsx` 展示的是 stage 流水线 + 资产挂在 stage 下，跟图二的"资产库编辑"完全不同。用户要的是：
- 只展示素材（人物、场景、道具、片段封面），不展示 stage 节点、不展示流水线连线。
- 同一角色的不同服装/造型要分组：用一个浅色圆角分组框圈起来，内部多张图横向排列，组上方标注角色名（如"林微"、"王老师"）。
- 不同组之间用贝塞尔曲线连接（角色→对应场景、片段→相关角色）。
- 顶部留"片段封面"独立节点；右侧大块为场景素材网格；底部为道具素材。

**改动范围**（仅 Canvas 视图层，不动数据生成与后端）：
- `src/components/sc/canvas/CanvasView.tsx`：重写布局算法
  - 不再渲染 `stagePos` / stage 节点 / stage→stage 连线。
  - 按 `asset.kind` + `asset.label` 前缀（C* 角色 / S* 场景 / P* 道具 / 片段封面）分区。
  - 角色资产按 `characterName`（或 `meta.character`）聚合成"角色组"卡片，组内横排该角色的所有服装版本，组头显示角色名 + 人物图标。
  - 组与组之间、组与相关场景/片段之间用贝塞尔曲线连接（沿用现有 SVG path 的 cubic Bezier 写法）。
  - 节点样式按图二：白底浅灰描边、圆角、轻阴影、底部小字标题、右下角版本数。
- 新增 `src/components/sc/canvas/AssetGroupCard.tsx`：角色分组卡片组件。
- 保留缩放、平移、点位指示器逻辑不动。

### 3. 不动的范围（明确边界）
- 不改 store 的运行时生成逻辑、不动 `runLife*` / `pollVideoTask` / 任务音频链路。
- 不改 Sidebar、项目详情页、收藏功能。
- 不动配色与设计 token，沿用现有 `--surface` / `--border` / `--accent`。
- 不顺手重构 `Workspace.tsx` 其他无关分支。

### 4. 验证
- 点开任一历史 task：时间线 = 当初生成时所见（brief 卡 + 完整脚本表 + 完整 thought + stage 摘要均完整）。
- 切到 Canvas 视图：只见素材；同一角色的多套服装在同一分组框内并用曲线相连；无 stage 节点。
- 切回 List 视图功能正常，无回归。

请确认是否按此执行。