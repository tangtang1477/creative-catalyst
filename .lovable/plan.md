## 目标
1. 在 Sidebar 的 Tasks 列表中添加「收藏」星星按钮，支持任务收藏/取消收藏，并将收藏的任务置顶展示。
2. 把"不修改未提及的地方"这条规则写入项目记忆，避免未来误改。

## 1. Tasks 收藏功能

### 数据层（src/lib/sc/types.ts、store.ts）
- 在 `TaskRecord` 上新增可选字段 `favorite?: boolean`。
- 在 `useSC` store 中新增 `toggleFavorite(taskId)` action：翻转 `taskHistory` 中对应任务的 `favorite` 字段，并持久化到 localStorage（与现有 `deleteTask` 走相同的持久化链路）。
- `normalizeTaskRecord` 中补一个默认值 `favorite: !!record.favorite`，确保历史/远端数据不报错（遵循 task-restore-safe 规则）。

### UI 层（src/components/sc/Sidebar.tsx）
- 在每个 task 行的 trash 按钮左侧新增一个星星按钮：
  - 未收藏：`Star`（lucide）描边图标，hover 才显示，与 trash 按钮一致。
  - 已收藏：填充态金色 `Star`（`fill-amber-400 text-amber-400`），常驻显示，hover 仍可点击切换。
  - 点击 `stopPropagation` 后调用 `toggleFavorite(t.id)`，不触发任务恢复。
- 排序：在 `useMemo` 的 `tasks` 计算中，把收藏的任务排到前面（active 任务依旧最顶），其余按现有 `updatedAt` 顺序。
- 仅改 Tasks 列表区域，不动 Projects、Pricing、UserHoverCard、导航等任何其他模块。

### 视觉
- 与现有 trash 按钮保持同一套尺寸（`h-6 w-6`、`h-3 w-3` 图标），不引入新的颜色 token。
- 收藏星星使用现有金色 token（如直接 `text-amber-400`，与项目中已有 `bg-amber-500/15` 等保持一致）。

## 2. 写入记忆

新增 `mem://constraints/scope-discipline.md`：
- 规则：除非用户在当前需求中明确点名，否则不要修改任何文件、模块、样式、复制、文案、行为。新功能也只在用户指定的位置落地，不顺手"优化"未提及的地方。
- 适用范围：所有后续迭代。

更新 `mem://index.md` 的 Core 段，追加一行：
> 用户未明确提出的地方一律不动；新增功能只落在用户点名的位置，禁止顺带改动其它模块/样式/文案。

## 不做的事
- 不动 Sidebar 其他区块（Projects、Pricing、Header、Nav）。
- 不改任何路由、store hydration、credits、media、详情页逻辑。
- 不做收藏的远端同步（仅本地持久化，遵循现有 taskHistory 的存储方式）。
