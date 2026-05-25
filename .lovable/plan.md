
# 计划：Gallery 重构 + Mention 修复 + 历史任务崩溃修复 + Thinking/Tool Loading 重做

## 1. Gallery 占比扩大 + 多素材组织（`MediaRail.tsx`）

**问题**：当前 rail 固定 340px，单列大卡片，素材一多就难以浏览；现在示例素材只有一图一视频。

**改造**：
- **宽度**：rail 由固定 `340px` 改为响应式 `min(560px, 42vw)`，最小 420，最大 640，可拖拽分隔条调整（新增 `useState resizeWidth` + 左侧 4px hit 区域，鼠标拖拽改变宽度，写入 localStorage `sc.rail.width`）。
- **视图模式切换**：rail 顶部新增 segmented control「网格 / 列表 / 时间线」三档（图标 Grid3x3 / List / GitBranch）。默认 grid。
- **Grid 模式**：
  - 缩略图卡片 `120×120`（series 模式按 episode/scene 分组），3–4 列自适应（`grid-cols-[repeat(auto-fill,minmax(120px,1fr))]`）。
  - 卡片底部胶囊显示编号 + kind icon；hover 显示标题；选中态外圈 accent ring。
  - 卡片右上角 status 小点（generating/ready/failed）。
- **List 模式**：保留当前竖向大卡布局，适合精细查看；行高 64px，左缩略 + 右文字 + 状态 + 操作。
- **时间线模式**（series 专用）：左侧 Episode 标签竖列，右侧 Scene 横向滚动卡片轨，便于按叙事顺序导航。
- **筛选条增强**：在现有 `all/image/video` 后追加 `wardrobe/character/scene/keyframe/shot` 资产标签 chip（基于 `asset.stageId` 或新增 `asset.tag`），单选过滤。
- **快速导航**：series 模式下，在顶部 sticky 区显示 Episode tab（EP1 / EP2 / EP3），点击平滑滚动到对应 block；当前可视 block 高亮 tab。
- **数量徽标**：每个分组 header 显示 `N` 计数 + 折叠箭头；当 N>8 时 group 默认折叠并显示 "展开 N" 按钮。
- **批量条** 保留，移到顶部 sticky 行。

**新增 mock 多素材**：扩充 `samples.ts` 中 demo assets，使一次任务至少产出 8–12 个（人物 ×3、场景 ×3、服装 ×2、关键帧 ×3、镜头视频 ×N）以验证 grid 布局。

---

## 2. 输入框 `@` 提及失效（`MentionPopover.tsx` + `CommandInput.tsx`）

**问题**：输入 `@` 没有弹出 popover。

**根因排查（plan 阶段判断）**：
1. `getQuery` 要求 `@` 前为空白或开头；若用户在已有文字后直接 `@`（无空格）会被拦截 → 放宽：允许任何非字母数字字符前置。
2. `items` 仅来自 `assets.filter(status==="Ready" && url)` + `attachments`；空状态（empty phase）下两者皆空 → popover 不渲染（80 行 `items.length===0 return null`）。应在 `query` 存在但 `items` 为空时仍渲染一个「暂无可引用素材，先生成或上传后再 @」的提示卡。
3. `caret` 同步：`textarea` 的 `onChange` 内立即调用 `updateCaret`（`requestAnimationFrame`），但首次输入 `@` 时 `caret` 可能为 0（state 初始）。改为在 `onChange` 内**同步**用 `e.target.selectionStart` 写入 caret state，不再依赖 rAF。

**修复**：
- `CommandInput.tsx`：`onChange` 内同步 `setCaret(e.target.selectionStart ?? 0)`。
- `MentionPopover.tsx`：
  - `getQuery` 放宽前置字符规则（`/[^\w]/` 或起始即可）。
  - `items` 空时仍渲染 popover，显示「@ 提及素材：暂无可用，生成后可引用 A01 / S01 …」提示，并支持显示**最近的 attachments 占位**。
  - 修复 `onPick("", -1, -1)` 关闭语义：父组件目前会把 `value` 与原值一致，因此关闭实际依赖父端不响应；调整为 `onPick` 收到 `from<0` 时父组件主动失去 popover（已有），但要确保 keydown Escape 不会冒泡到 textarea 的 onKey（已 `preventDefault`，OK）。

---

## 3. 修复历史任务点击崩溃（图 11）

**问题**：点击 sidebar 左侧任何历史 task（包括正在运行的 active），右侧整页崩溃为 "This page didn't load"，属 React error #418（hydration / render 异常）。

**根因**：`restoreTask`（store.ts L898）把所有 stages 强制设为 `ready`，但只回放了 `assets` 与 `brief.prompt`，**未回放** stage 内置数据（segments / storyboard / wardrobe 列表 / qc 报告等）。`ScriptTable`、`StoryboardTable`、`QCPanel`、`QualityCheck` 等组件假设这些数据存在，访问 undefined 字段时抛错→根 boundary 触发整页 error UI。同时 active 任务被点也会进入 `restoreTask` 分支（sidebar 仅在 `!isActive` 时调用，但 isActive 判定要求 `phase !== "empty"`，初始 `phase=running` 时 active 高亮但点击不触发 restore；不过如果用户点击的是「当前 running 任务」的标题再来回切换，仍会经过 restore 一次）。

**修复**：
1. **快照增强**：`snapshotTask`（L300）持久化字段扩展为 `{ id, title, kind, prompt, brief(full), assets, segments, storyboard, wardrobe, qc, recovery, stages? }`，并写入 localStorage。
2. **restoreTask 完整还原**：把 brief / segments / storyboard / wardrobe / qc / recovery 等都 set 回 store；stages 状态按快照真实状态（done/failed），未存的字段给安全默认值（`[]`、`null`）。
3. **防御渲染**：
   - `ScriptTable` / `StoryboardTable` / `QCPanel` / `QualityCheck` / `WardrobePanel` / `SeriesBible` 入口加 `if (!data?.length) return null;` 兜底，杜绝 undefined 字段访问。
   - 在 `Workspace.tsx` 的渲染体外包 `ErrorBoundary` fallback，崩溃时只折叠该 stage block 并显示 "本步骤数据已过期，无法回放"，而不是整页崩溃。
4. **active 守卫**：sidebar 点击 active 任务时静默 no-op（已具备 `!isActive && restoreTask`），但 isActive 判定改为 `t.id === taskId`（不依赖 phase），防止边缘情况进入 restore。
5. **正在运行任务点击**：若 `t.status === "running"` 且非当前 active，提示 toast「该任务正在运行，无法回放快照」并不切换。

---

## 4. Thinking / Skills / Tools Loading 按视频重做

**问题**：当前 `ThinkingBlock` / `ToolCallLine` 样式简陋；信息密度低；缺少视频中的"层级感与品牌质感"。

**目标样式（参考视频）**：
- 左侧细竖线 + 顶部图标 + 当前正在执行项 "Using skill xxx · 1.8s" 单行胶囊，省略号动画在末尾。
- 完成项折叠为一行小字"✓ Generated 3 character refs · 4.2s"，可点击展开看详情。
- 思考块（Thought）开头显示一个**淡 accent 渐变背景**的小卡片，标题 + 一行摘要 + ChevronDown；展开后显示完整 markdown 段落与缩略图。

**改动**：

### 4.1 新增 `src/components/sc/ProcessLog.tsx`（核心容器）
统一渲染 stage 内"流式过程日志"，按时间线垂直排列 items：
```
| ● Thinking…            "正在分析人物风格…"
| ✦ Using skill char-gen  · 1.2s
| ◉ Calling tool image    · 3.4s
| ▢ Thought: 根据素材生成分镜  ▾  （可展开 → 缩略图 + 详细推理）
| ✓ Generated A01 keyframe · 4.8s
```
- 左侧 2px 竖线 `bg-gradient-to-b from-accent/40 to-transparent`，每项左侧 8px 圆点 spike；running 项圆点 `animate-pulse + ring-accent/40 ring-4`。
- 每项 `min-h-7`，font `[12px]`，单行胶囊样式 `rounded-lg bg-background/40 px-2.5 py-1.5`。
- 计时 `tabular-nums`；running 项实时刷新（已有）。

### 4.2 重做 `ToolCallLine.tsx`
- icon 区改为 12×12 圆形容器，内嵌 Sparkles（skill）/ Wrench（tool）/ Brain（thought）。
- running 时图标外圈 `ring-2 ring-accent/30 animate-pulse`，文本"Using skill **{name}**"加粗 accent；完成态"Used skill **{name}**"灰字 + ✓。
- 支持 hover 显示 tooltip：tool 的 input / output 参数预览。
- 末尾时长徽章 `bg-surface-2 px-1.5 rounded-md`。

### 4.3 重做 `ThinkingBlock.tsx`
- header 行：`Brain` icon（accent）+ "Thought · {title}" + 摘要前 40 字预览（折叠态）+ ChevronDown。
- 折叠态显示一行"💡 摘要：…基于 3 张人物素材推导出 5 个镜头"。
- 展开后：
  - 顶部分段标题 "推理过程"，段落以 `· ` 起首。
  - **缩略图段落**：当 `thumbAssetIds.length > 0` 时，渲染"参考素材"小标题 + 横向滚动 thumb 列表（`80×80` 圆角，hover 放大并显示 caption tooltip），点击 thumb 触发 `flashAsset(id)` 高亮 rail 中对应卡片。
  - 底部"耗时 4.2s · 引用 3 个素材"统计行。
- 整体外框由扁平 `border-border` 改为 `border-l-2 border-accent/30 bg-gradient-to-r from-accent/[0.04] to-transparent rounded-r-xl`，更有"思考"质感。

### 4.4 `StageRow.tsx` 接入
在 stage `running` 状态下，stage body 渲染 `<ProcessLog stageId={id} />` 替代当前散落的 Thought / ToolCall 渲染，做到所有 stage 一致的过程展示。

### 4.5 类型与数据
- `types.ts` 中 `ToolCall` 增加 `summary?: string` 字段，便于完成后单行总结。
- `Thought` 增加 `summary?: string`（折叠态预览）与 `elapsedMs?: number`。
- `store.ts` 的 mock 生成逻辑里：每个 stage 注入 1 个 Thought + 2–4 个 ToolCall，wardrobe / paint / structure 阶段在 thought 上挂接 `thumbAssetIds`（结构生成后 thumbs 指向 wardrobe/character 素材，便于演示"展开看素材"）。

---

## 五、文件改动总览

**新增**
- `src/components/sc/ProcessLog.tsx`

**编辑**
- `src/components/sc/MediaRail.tsx` — 宽度可调、视图模式切换、grid/list/timeline、Episode tab。
- `src/components/sc/CommandInput.tsx` — caret 同步修复。
- `src/components/sc/MentionPopover.tsx` — getQuery 放宽、空态提示、显示更丰富。
- `src/components/sc/ThinkingBlock.tsx` — 视频参考样式重做。
- `src/components/sc/ToolCallLine.tsx` — 视频参考样式重做。
- `src/components/sc/StageRow.tsx` — 接入 ProcessLog。
- `src/components/sc/Workspace.tsx` — 包裹 ErrorBoundary 容错。
- `src/components/sc/ScriptTable.tsx` / `QCPanel.tsx` / `QualityCheck.tsx` / `WardrobePanel.tsx` / `SeriesBible.tsx` — 入口空数据兜底。
- `src/components/sc/Sidebar.tsx` — active 守卫 + running 提示。
- `src/lib/sc/store.ts` — snapshotTask 字段扩展、restoreTask 全量回放、Thought/Tool mock 增强。
- `src/lib/sc/types.ts` — Thought / ToolCall 增 summary/elapsedMs/thumbAssetIds。
- `src/lib/sc/samples.ts` — 扩充 demo 多素材。
- `src/styles.css` — 新增 process-log 相关 keyframes（spike-pulse、thought-glow）。

## 六、验收
1. Gallery 默认宽 ≥420px，可拖拽；grid 模式 3 列缩略图整齐排布；series 模式 Episode tab 平滑导航。
2. 输入框任意位置输入 `@` 立即弹出引用面板；无素材时显示提示而非完全不出。
3. 点击任何历史/当前任务 sidebar 项不再白屏，回放保留 brief / 表格 / 素材；缺失数据的 stage 优雅降级。
4. Thinking / Tool / Skill 调用样式与视频参考一致：左竖线 + 圆点 + 行内胶囊 + 时长徽章；Thought 可展开，展开后能看到生成依据的素材缩略图，点击 thumb 高亮 rail。
