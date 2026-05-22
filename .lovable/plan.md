
## 1. 替换 Logo（新玻璃胶片质感 M）
- 用上传的 `user-uploads://Image_1.png` 覆盖 `src/assets/logo-m.png`（带青→紫渐变胶片质感）。
- `Logo.tsx` 新增 `glow` prop（默认 false）。`glow=true` 时叠加：
  - `filter: drop-shadow(0 0 8px rgba(113,240,246,.55)) drop-shadow(0 0 16px rgba(180,120,255,.4))`
  - 同时套用现有 `logo-shimmer`（呼吸 + 渐变发光）keyframes（在 `styles.css` 中扩展为透明度 + drop-shadow 双轨动画 1.8s ease-in-out infinite）。
- Empty 状态输入框上方的 48px Logo 默认就开 `glow`（恒定眩光，不依赖 loading）。
- 删除 Sidebar 左下角 Tooltip（见第 2 点）。

## 2. 移除头像 Hover 信息
- `Sidebar.tsx` 把底部用户区的 `TooltipProvider/Tooltip/TooltipTrigger/TooltipContent` 全部去掉，恢复成纯 `<div>` 容器，邮箱保留 truncate（hover 不再展开提示卡）。

## 3. 输入框头部加号 & 模型下拉重做（按上传图 2）
- `CommandInput.tsx` 把左侧 Plus icon button 改为：`h-7 w-7 rounded-full border border-border bg-transparent hover:bg-surface-2 hover:border-accent/60 active:scale-95`（带描边的圆形 button，3 态完整）。
- 中间模型选择器改为 shadcn `DropdownMenu`：
  - Trigger：`<Logo size={14} glow /> Claude  Sonnet 4.6  ▾`（默认显示 Claude Sonnet 4.6，模型名称重一些，子版本号 muted）。
  - 菜单内容按图 2 分组：
    - 区段标题 `Claude`（带 spark icon）：`Sonnet 4.6`（默认选中，行尾打勾）、`Opus 4.6`、`Opus 4.7`（行尾带 `Upgrade` accent chip）
    - 分割线 + 区段标题 `Google`（带 G icon）：`Gemini 3.1 Pro`
    - 分割线 + 区段标题 `OpenAI`（带 OpenAI icon）：`GPT-5.5`、`GPT-5 mini`
  - 样式：`rounded-2xl bg-surface border-border` 圆角阴影，选项 `hover:bg-surface-2 rounded-xl`，选中态文本 `text-foreground` + 末尾 `Check`，其他文本 `text-muted-foreground`。
  - 状态用 useState 本地存 `selectedModel`（默认 `Claude Sonnet 4.6`）。

## 4. New Task 重置到全新 Empty 页
- `Sidebar.tsx` 的 New task 按钮已绑定 `reset`，但当前 `reset` 没清 `gate` 之外的"recent tasks"高亮。本次仅确认：点击后 store 进入 `phase: 'empty'`、清空 brief/assets/stages/rail/timers，关闭侧栏当前任务的 active 高亮（隐藏当前 task 行的逻辑已有 `phase !== 'empty'` 判断）。
- 额外：`reset()` 中增加 `set({ rail: { open: false, flashId: undefined, focusedAssetId: undefined } })`，并清掉 `gate: null`。点击 `+ New task` 同时触发一次轻动画（CommandInput key 重置），保证 textarea 内容也清空。

## 5. Auto Run 下拉 + 发送按钮（按上传图 3）
- `CommandInput.tsx` 右下 Auto Run 改为 shadcn `DropdownMenu`：
  - Trigger：纯文字 `Auto Run ▾`，`rounded-full px-3 h-7 bg-surface-2 hover:bg-accent/15 hover:text-accent`。
  - 菜单两项：
    1. `Auto-run without asking`（icon = Check 圈，末尾打勾标记选中）
    2. `Confirm before running`（icon = ✋ 手势）
  - 选中态写入 store `autoMode: 'auto' | 'confirm'`，影响 `isFullAuto` 判断（auto 模式跳过 intake 与 gate）。
- 发送按钮：固定 `rounded-full h-9 w-9 bg-accent text-background hover:brightness-110 active:scale-95`，icon 为 `ArrowUp`；hover 时加 accent 光晕 `shadow-[0_0_12px_rgba(113,240,246,.5)]`。
- Auto Run 与 Send 之间间距 8px，整体右对齐，垂直居中（与图 3 一致）。

## 6. 丝滑展开/收起
- 新建 `src/components/sc/Collapse.tsx`：基于 max-height + opacity 的纯 CSS 过渡组件（`transition-[max-height,opacity] duration-300 ease-out`，闭合时 `max-h-0 opacity-0 overflow-hidden`）。组件内 `useRef` 测量内容高度后写 `--collapse-h`。
- 替换 `StageRow.tsx` 中 `expanded && (...)` 的硬条件：summary、children、details 区都用 `<Collapse open={...}>` 包裹，闭合时高度动画到 0（媒体卡使用 `keepChildrenWhenCollapsed` 时不进入 Collapse，仅 details 区折叠）。
- `MediaRail.tsx`：
  - `Group` 内 children 区也用 `<Collapse>` 包裹分组折叠动画。
  - Rail 整体抽屉打开/关闭加 `transition-transform duration-300 ease-out`：`open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'`，在 `<lg` 时为抽屉滑入，`>=lg` 时仍可被 Gallery 按钮折叠（见下）。
- Workspace 顶 bar 的 `Gallery` 按钮绑定 `setRailOpen(!rail.open)`，并按 `rail.open` 切换 `selected` 视觉态（accent 背景）。`>=lg` 也支持折叠：Rail 容器追加 `lg:w-[340px] lg:data-[open=false]:w-0 lg:overflow-hidden transition-[width] duration-300`，通过 `data-open` 控制。

## 7. 流式输出 + 更真实的 Loading
- `store.ts` 新增辅助 `streamText(target: 'stage'|..., id, lines: string[], perCharMs=18)`：把 `summary` 数组按字符逐步追加到 stage 的最后一行；用 setTimeout 链推进，并把句末换行作为下一条 summary 起点。
- 每个 stage 的 summary 改为通过 `streamText` 写入，而非一次性 `markStageReady`。具体节奏：
  - `scene`：先写 "正在分析 brand brief…" → 1.4s 后继续追加 "锁定情绪 = premium twilight" → 0.8s 后第三行；总耗时 ~3.2s。
  - `structure`：6 行脚本逐行流出，每行 ~1s；ScriptTable/StoryboardTable 也按行 fade-in（用 `animation: streamFade 300ms ease-out backwards; animation-delay: i*120ms`）。
  - `paint`：A01 状态 `Queued → Generating(2s) → Processing(2.5s) → Ready(2s)`，总计 ~6.5s；ready 后 keyframe 图片用 blur-up（先 `filter:blur(20px)`，加载后过渡到 0）。
  - `life`：V01 `Queued(1s) → Processing(3s) → Status checked(2s) → Ready(2s)`，~8s。
  - `details`：QC 条目按 ✓ 一项项流出，每项 400ms。
- `thinking` 阶段延长到 1.5–2.5s 随机；期间 `Thinking…` 文案做 3 阶 ellipsis 动画。
- 新增 CSS：`@keyframes streamFade { from { opacity:0; translate:0 4px } to { opacity:1; translate:0 0 } }`、`@keyframes blurUp { from { filter: blur(18px); opacity:.5 } to { filter:blur(0); opacity:1 } }`。
- `AssetCard.tsx` 加载图片用 `<img onLoad>` 触发 blurUp。
- StageRow 的 summary 列表逐行 enter 用 `streamFade`（key 改动时新行 fade-in）。

## 8. 每组选项都加 Others
- `intake-engine.ts`：`adType / format / visualSource / mode` 四组返回末尾都追加常量 `"Others…"`。
- `IntakeCard.tsx`：当用户点击某组的 `Others…` 时，把该 chip 换成行内 `<input>`（`autoFocus`，回车或 blur 后写入 `sel[group]` 并替换为新自定义 chip 显示，下方仍保留 `Others…` 入口以便再次自定义）。
- 视觉：`Others…` chip 用 dashed 风格 → `bg-transparent border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent`（仅这一项例外允许 border，区分语义）。
- 同步：`SuggestionChips.tsx` 顶部 chip 行末尾追加一个 `Others…` chip，点击展开本地输入弹层（reuse 同样 inline 输入逻辑，回车 → `setPrompt(custom)`）。

---

## 技术细节

### 文件改动
- **新增**：`src/components/sc/Collapse.tsx`、`src/components/sc/ModelMenu.tsx`、`src/components/sc/AutoRunMenu.tsx`、`src/components/sc/OthersChip.tsx`。
- **修改**：
  - `src/assets/logo-m.png`（覆盖为新图）
  - `src/components/sc/Logo.tsx`（新增 glow prop）
  - `src/styles.css`（logo-shimmer 升级 + streamFade/blurUp/ellipsis keyframes）
  - `src/components/sc/Sidebar.tsx`（去 Tooltip + 强化 reset）
  - `src/components/sc/CommandInput.tsx`（圆形 Plus + ModelMenu + AutoRunMenu + 圆形 Send）
  - `src/components/sc/Workspace.tsx`（顶 Logo 加 glow / Gallery 按钮联动 rail / 流式 ghost 渲染）
  - `src/components/sc/StageRow.tsx`（用 Collapse + 行级 streamFade）
  - `src/components/sc/MediaRail.tsx`（Collapse 分组 + 桌面端 width 折叠 + 抽屉滑入）
  - `src/components/sc/IntakeCard.tsx`（Others 自定义）
  - `src/components/sc/SuggestionChips.tsx`（追加 Others chip）
  - `src/components/sc/AssetCard.tsx`（blur-up 加载）
  - `src/lib/sc/intake-engine.ts`（每组追加 Others…）
  - `src/lib/sc/store.ts`（streamText 工具 + autoMode 状态 + setAutoMode + reset 增强 + 各阶段流式时序）
  - `src/lib/sc/types.ts`（Brief 内可选 `Others`，无破坏性改动；新增 `AutoMode = 'auto'|'confirm'`）

### 关键时序总览
```text
Empty → submit
  → thinking (1.5–2.5s, 文字 ellipsis 动画)
  → intake（除非 autoMode='auto'）
  → running:
     scene     ~3.2s (3 行流式)
     structure ~6.0s (6 行流式 + 表格逐行 fade-in) → gate(script) 等待确认
     paint     ~6.5s (A01 4 状态切换 + blur-up) → gate(keyframe) 等待确认
     life      ~8.0s (V01 4 状态切换)
     details   ~2.0s (QC ✓ 逐条)
  → done
```

### 不改动
- 后端、路由、整体布局结构、theme token (#71F0F6) 等保持不变。
- 已有的 `?state=` 调试入口保留可用。

## 验收
1. Logo 是新青紫胶片 M；Empty 输入框上方 logo 持续眩光呼吸；侧栏/topbar logo 在 thinking/running 时呼吸。
2. 左下角头像 hover 不再弹出任何浮层。
3. 加号是圆形描边 button（hover accent 描边、active 缩放）；模型选择器默认 `Claude Sonnet 4.6`，下拉按图 2 分组展示并能切换。
4. 点击 New task 立即回到全新 Empty 页（输入清空、assets/stages/rail 全部归零）。
5. Auto Run 下拉两项可切换；右侧 Send 是圆形 accent 按钮，hover 有光晕、active 缩放。
6. 所有 chevron 展开/收起都有 300ms max-height 过渡；点击 Gallery 可平滑展开/收起右侧素材区。
7. 进入流程后所有文字逐字 / 逐行流出；图片有 blur-up；视频进度有多状态切换；总流程 > 25s 模拟真实生成。
8. Intake 与 Suggestion 的每组末尾都有 `Others…`（虚线 chip），点击可内联输入自定义内容并被选中。
