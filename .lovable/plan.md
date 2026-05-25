# 实施计划

## 1. 主题切换器改为滑块（图1）

**文件**：`src/components/sc/UserHoverCard.tsx`

将现有的 Dark/Light 两个分立按钮改为一个带滑块的胶囊：
- 容器 `relative` + `bg-surface-2` 圆角 pill，两个按钮 `flex-1`、`z-10` 透明背景。
- 在容器内绝对定位一个 `bg-background shadow` 的滑块 `absolute top-1 bottom-1 left-1 w-[calc(50%-4px)]`，根据 `theme` 状态用 `translate-x-full` 平移。
- 过渡：`transition-transform duration-300 ease-out`。
- 文字/图标颜色由 `theme` 决定 active/inactive（`text-foreground` vs `text-muted-foreground`），不再依赖背景。

## 2. 用户消息合入主对话流（图2，ChatGPT 风）

**问题**：当前 `chatLog` 在 `Workspace` 底部独立渲染，与上方 agent 阶段输出割裂；并且需要保证不跨 task 残留。

**改动**：

### 2.1 把 chat 消息渲染进主滚动区
- `src/components/sc/Workspace.tsx`：删除底部 `chatLog` 滚动块（291–314 行那段）。
- 在 `inFlow` 分支的最后（`gate` 之前/之后均可，放在所有 `STAGE_ORDER.map` 之后）追加 `chatLog.map`，气泡样式不变：
  - user → 右对齐 `bg-surface-2`；
  - agent → 左对齐 `border bg-surface`，前置一个 `Logo size={14}`。
- 这样新消息会随主区滚动到底部，跟 stage 输出共用一条时间线。
- 主区底部留一个 `<div ref={endRef} />`，每次 `chatLog` 或 `stages` 变化时 `endRef.scrollIntoView({ behavior: "smooth" })`，模仿 ChatGPT 自动滚动。

### 2.2 task 隔离
- `src/lib/sc/store.ts`：
  - `submit()` 开始新 task 时 `set({ chatLog: [] })`（确认当前已重置；若无则加上）。
  - `reset()` 已清空，但 `restoreTask()` 也需 `chatLog: []`，避免历史 task 带入当前对话。
  - `cancel()` 不清空 chatLog（用户暂停后还可能继续聊）。

### 2.3 chat 不再在阶段中插入"已收到"
保留 agent 回复（`chatMessage` 内部 1.2s 后回的那条），但文案根据当前 phase 区分：`running` 时回 "已记录，将在当前镜头完成后调整"，`done` 时回 "好的，需要我重新渲染哪些镜头？"。

## 3. 素材通用工具栏（图3 / 4 / 5）

目标：所有素材卡（gallery `AssetThumbCard`、`AssetCard`、stage 内联的 paint/life 卡）共享同一套 hover 工具栏：
- 左上角：选择框（hover 显示，选中后常驻并填色）
- 右上角：Download
- 右下角：Add to task
- 多选时底部出现浮动批量操作条（图4）
- Add to task → 缩略图出现在输入框上方 attachment chips（图5）

### 3.1 抽出共享组件

新建 `src/components/sc/AssetActions.tsx`：

```tsx
export function AssetActions({
  asset,
  selectable,   // 多选模式是否激活
  selected,
  onToggle,     // (id)
  onAddToTask,  // (asset)
  onDownload,   // (asset)
  variant,      // "thumb" | "card"
})
```

渲染 3 个绝对定位按钮：
- 左上 checkbox：`opacity-0 group-hover:opacity-100`，`selected || selectable` 时强制 `opacity-100`，圆角小方框（不是圆形）以匹配图3。
- 右上 download：`opacity-0 group-hover:opacity-100`，背景 `bg-black/55 backdrop-blur`，调用 `onDownload(asset)`（先用 `<a href={asset.url} download>` 模拟）。
- 右下 add-to-task：`opacity-0 group-hover:opacity-100`，胶囊形 `+ Add to task` 文案；`variant="thumb"` 下只显示 `+` 图标节省空间。

`onAddToTask` 默认调用 store 的 `addAttachment`，把 asset 转成 `Attachment`：
```ts
{ id: uid(), kind: asset.kind, name: asset.label, url: asset.url, thumb: asset.kind === "image" ? asset.url : asset.poster, source: "asset", ref: asset.label }
```

### 3.2 接入 AssetThumbCard 和 AssetCard
- `AssetThumbCard.tsx`：删除现有 top status row 中的 checkbox 逻辑，改成 `<AssetActions variant="thumb" .../>`；保留状态点。
- `AssetCard.tsx`：删除右上角原 checkbox，改成 `<AssetActions variant="card" .../>`；保留下方 Open/Replace/Download 行（gallery 之外的内联展示也享受 hover 工具栏）。

### 3.3 自动激活多选 + 浮动操作条（图4）

- `MediaRail.tsx`：去掉手动的多选按钮"打开/关闭"语义。改为：**任意素材一旦被选中（`selection.length > 0`）即视为多选模式**，`AssetActions` 接收 `selectable = selection.length > 0 || hover`。
  - 顶部多选按钮保留为"全选当前过滤集合"的快捷开关。
- 删除 MediaRail 内部那个 `border-b` 的多选 toolbar；改成 `position: absolute; bottom: 12px; left: 12px; right: 12px` 的浮动胶囊条，仅当 `selection.length > 0` 时挂载，带 `[animation:stream-fade_240ms_ease-out_both]` 滑入动画。
- 浮动条内容：
  - 左：`已选 N`
  - 中按钮：`Add to task`（批量把选中素材推入 attachments），`Download`（zip 暂用提示），`批量修改`（沿用 `BatchEditDialog`）
  - 右：关闭 X（= `clearSelection()`）

### 3.4 消息流中的内联素材也支持

- `Workspace.tsx` paint 阶段（212–232 行）和 life 阶段的 `AssetCard` 已自动继承 3.2 改动，无需额外改动。
- `ThinkingBlock` 内的 thumb 也用 `AssetThumbCard` 渲染则自动获得（如目前用 `<img>` 简化则保持不变）。

### 3.5 attachment chips 兼容
`AttachmentChips.tsx` 已支持 `thumb` + `source: "asset"`，无需改动；视觉与图5一致（小方块缩略图 + `@label`）。

---

## 技术备注

- 不引入新依赖。
- 所有颜色用 `var(--accent)`/`bg-surface-2`/`border-border` 等已有 token；浮动操作条用 `bg-background/95 backdrop-blur shadow-2xl ring-1 ring-border`。
- `AssetActions` 内按钮 `stopPropagation()`，防止点击下载/add 触发卡片的"跳转到 stage"。
- chat 自动滚动通过 `useEffect([chatLog.length, stagesSerialized])` 触发；阶段变化太频繁时用 throttled ref 防抖。
