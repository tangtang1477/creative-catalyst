## 目标

完成上一轮遗留的最后一步收尾：把 MediaRail 的多选 UI 工具条和"批量修改"按钮真正接到 store 的 `selection` / `batchEditAssets` 上，并打开已经创建好的 `BatchEditDialog`，让用户能选中多张素材后触发流式批量重新生成。

## 现状

- `store.ts` 里已经有 `selection`、`toggleSelect`、`clearSelection`、`batchEditAssets`。
- `BatchEditDialog.tsx` 组件已存在，但目前在 `MediaRail` 里只是 `import` 进来，没有任何 UI 入口能打开它。
- `MediaRail` 已经从 store 解构了 `selection / toggleSelect / clearSelection`，但既没有"多选模式开关"，也没有把 `selected / onToggleSelect` 透传给 `AssetCard`。
- 结果：右侧资产栏看起来正常，但批量修改路径完全走不通。

## 改动范围（仅前端展示层，不动业务逻辑）

### 1. `src/components/sc/MediaRail.tsx`
- 顶部 header 增加"多选"开关按钮（`CheckSquare` 图标）：点击切换 `multi` 状态；关闭时调用 `clearSelection()`。
- 在 `multi === true` 时，在 header 下方显示一个 sticky 工具条：
  - 左侧：`已选 N / 共 M`
  - 右侧：`清空` + 主按钮 `批量修改`（禁用条件：`selection.length < 2`），点击打开 `BatchEditDialog`。
- 把 `multi`、`selection.includes(a.id)`、`toggleSelect` 通过新增的 `selectable / selected / onToggle` props 传给所有 `AssetCard`（series 和非 series 两个分支都要传）。
- 渲染 `<BatchEditDialog open={batchOpen} onOpenChange={setBatchOpen} assetIds={selection} />`，关闭对话框后保持选择不变，由 `batchEditAssets` 自己在完成后清空。

### 2. `src/components/sc/AssetCard.tsx`
- 新增可选 props：`selectable?: boolean`、`selected?: boolean`、`onToggle?: (id: string) => void`。
- 当 `selectable` 为 true：
  - 整卡点击改为 `onToggle(asset.id)`（不再打开预览）。
  - 右上角覆盖一个圆形 checkbox（选中态用 `accent` token）。
  - 选中时卡片加 `ring-2 ring-accent` 视觉反馈。
- 默认行为（`selectable` 未传）保持现状不变，避免影响 canvas / 单图预览等其他调用方。

### 3. `src/components/sc/BatchEditDialog.tsx`（仅校验接口）
- 确认它接收 `open / onOpenChange / assetIds`，提交时调用 `batchEditAssets(assetIds, prompt)` 并 `onOpenChange(false)`；如签名不一致再做最小适配。

## 验证

- 进入生成阶段后右侧 Assets 栏可见素材 → 点 header 的多选按钮 → 工具条出现 → 勾选 2 张以上素材 → `批量修改` 可点 → 弹窗输入提示词 → 提交后 `details` 阶段出现流式 tool call，被选素材依次走 `Recovering → Processing → Ready`。
- 关闭多选模式后，`AssetCard` 恢复默认点击行为，不影响 canvas 视图。
- 仅修改 3 个前端文件，不触碰 store / 类型 / 流程逻辑。
