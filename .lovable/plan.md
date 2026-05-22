
## 1. 模型下拉用真实品牌 icon
- `ModelMenu.tsx`：新建 `BrandIcon` 子组件，用纯 SVG（无外部依赖）：
  - **Claude**：橙红色 8 角星形（Anthropic logomark 简化版，`#D97757`），替代 trigger 里的 Logo 与菜单内的 Sparkles。
  - **Google**：彩色 G 多色 SVG（蓝/红/黄/绿四段路径），替代当前渐变圆。
  - **OpenAI**：黑/白六瓣花瓣 SVG（OpenAI logomark 简化），替代当前 `O` 占位。
- Trigger 当前 model 前的 icon 也根据 `selected` 切换为对应品牌（Claude 时显示橙色 8 角星，不再用产品 Logo）。
- 菜单项左侧不加 icon 保持现状（仅 group 头有 icon）。

## 2. Auto Run 位置、下拉方向、行为闭环
- 当前 `side="top"`、按钮 trigger 在输入框右下 → 视觉上"在上方弹出"。改为：
  - `DropdownMenu` 改 `side="bottom"`、`align="end"`、`sideOffset={6}`，让菜单**向下展开**到输入框外侧。
- 选中后 trigger 文案动态：`Auto Run · Auto` / `Auto Run · Confirm`，并在 trigger 内显示一个小指示点（accent dot）。
- 真正影响流程：
  - `store.ts` 中 `submit` 已读 `autoMode === 'auto'` → 当前只跳过 intake 直接 startRunning。补全：
    - `autoMode === 'auto'`：跳过 intake **且** 后续 script gate / keyframe gate 也跳过（`isAutoFlow()` 已实现，确保 `runStructure` 与 `runPaint` 都走 auto 分支，无需 ApprovalChips）。
    - `autoMode === 'confirm'`：强制走完整 intake + 双 gate，即使 prompt 含 "全自动" 关键字也以用户选择为准（移除 `isFullAutoPrompt` 在 `submit` 中的兜底；只在 `isAutoFlow()` 内保留兜底以避免 prompt 既写"全自动"又选 confirm 的矛盾——以 UI 选择优先）。
- 切换 `autoMode` 时若当前 phase=running，**不**重置已运行任务，只影响后续阶段（弹出 toast：`Mode switched to … · 应用到下一步`）。

## 3. 侧栏丝滑收起/展开
- `Sidebar.tsx` 顶部 chevron 按钮当前只是装饰。新增 `sidebarOpen` 本地状态（localStorage 持久化 key=`sc.sidebar`）。
- 把 `<aside>` 宽度从硬编码 `w-[228px]` 改为基于 state 的 `data-open` 属性 + `transition-[width] duration-300 ease-out`：
  - 展开：`w-[228px]`
  - 收起：`w-[56px]`（只显示 icon + logo 小图），文字节点用 `opacity` + `pointer-events-none` 过渡淡出。
- 折叠态下：
  - Nav 项只显示 icon，hover tooltip 显示名称（用 shadcn Tooltip，唯一保留 Tooltip 的位置）。
  - Tasks 区折叠隐藏（只保留 New task icon）。
  - 用户区只保留头像 + 设置 icon。
- chevron 按钮绑定 toggle，rotate 180deg 反馈方向。

## 4. Tasks 真实记忆 + 蓝点 loading + 移除 Needs approval 默认
- 新增 `taskHistory` 持久化（`localStorage` key=`sc.tasks`）：
  - `Task = { id, title, prompt, createdAt, status: 'running'|'done'|'failed', assets: Asset[] }`
  - `submit()` 新建一条 task（生成 `id = nanoid`），写入 `prompt` 与推断 `title`。
  - 各阶段结束/失败更新对应 task 的 `status` 与 `assets`。
  - 侧栏 Tasks 区从 `taskHistory.slice(0, 12)` 渲染，最新置顶；点击恢复（`reset` 后从 history 还原 `brief` + `assets` + 标记所有 stage 为 ready 的快照视图）。
- 移除硬编码 `recentTasks` 数组与默认 `Needs approval` chip。
- **闪烁蓝点**（参考图3）：
  - 新组件 `PulseDot.tsx`：一个 8px 圆形 + 两个外圈，`@keyframes pulseRing` 由内向外 0→1.8 倍 + opacity 1→0；颜色 `--accent`。
  - Tasks 行右侧：`task.status === 'running'` 时渲染 `<PulseDot />`，替换原方块 badge。`done` 不显示，`failed` 显示红色静态点。
- 新 task / 当前 active task 高亮（accent 左边竖线 2px）。

## 5. + 加号附件 & @ 引用（参考 AI Video Weaver）
- 新增 `src/components/sc/AttachMenu.tsx`：点击 + 弹 popover，选项：
  - `Upload image…` / `Upload video…`（触发 `<input type=file accept=...>`）
  - `Paste URL…`（输入框 + 确认）
  - `From Gallery`（列出当前 task 已生成 assets）
- 上传后写入 `useSC().attachments: Attachment[]`（`{ id, kind: 'image'|'video', name, url, thumb }`，url 用 `URL.createObjectURL`）。
- 输入框上方渲染 `AttachmentChips`：每个附件一个小缩略图 chip + 删除 X，hover 显示文件名。
- **@ 引用**：
  - `CommandInput` 监听 `@` 字符 → 在光标位置弹出浮层 `MentionPopover`，列出 `attachments + 当前 task 已生成 assets`，键盘上下选择 + Enter 插入 `@assetName`，原文以 token 形式高亮（用一个 controlled `contenteditable=false` 的 span 渲染策略：保留 textarea + 在显示层做 lightweight regex 高亮，简化实现）。
  - 选中后写入 `prompt` 字符串 `@A01` 占位，submit 时 `mentions` 字段一并提交给 store（用于后续可视化或上下文）。

## 6. 鼠标跟随画布（AI Video Weaver 同款）
- 重写 `DotGridBackground.tsx`：
  - 全屏 canvas 渲染 dot grid（16px 间隔，dot 半径 1px，base color `oklch(0.32 0 0 / .35)`）。
  - 监听 `mousemove`：以光标为圆心，半径 220px 内的 dot 距离 → 用高斯衰减映射为 accent 颜色（`#71F0F6`）插值 + 半径放大 1→2.4x。
  - 启用 `requestAnimationFrame` 持续重绘，使用 dirty region（只重绘光标附近 + 上一帧光标附近矩形）保证性能。
  - 离开窗口/`prefers-reduced-motion` → 退化为静态网格。
- **挂载范围扩大**：不再仅 `phase === 'empty'`，改为始终挂在 `Workspace` body 背景层（z 在内容之下），让交互过程也保留淡淡的网格质感。

## 7. Pricing 按钮重做
- `Sidebar.tsx` Pricing 区：
  - 容器：`rounded-2xl bg-surface-2/60 ring-1 ring-border` + hover `ring-accent/60 bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface-2))]`。
  - 内填充：左 icon 用 `lucide` `Gem`（替代 CreditCard）+ accent 颜色；文字 "Pricing"。
  - 51% OFF tag：背景 `bg-accent text-accent-foreground rounded-full px-2 py-0.5 font-semibold`（替代原 red），与主题色一致。
  - 整体 padding 加大到 `py-2.5 px-3`，圆角 `rounded-2xl`。

## 8. 用户区 hover 卡片 + 亮/暗主题切换
- 把当前底部用户行改为 Popover trigger（hover + click 都展开，使用 `HoverCard` from shadcn）。
- Popover 内容 = 按上传图 1 重做：
  - 顶部头像 + `galileo_slug_500`（→改为 `Vic`）+ Plan 标签
  - 工作区切换行（Vic 旁的勾），`+ New workspace`
  - Credits 进度条（mock：58 left，2 / 20 dots filled，accent 色）
  - `Top-up credits` / `Boost speed`，右侧 `Get` 按钮（accent 填充圆角胶囊）
  - **Dark / Light toggle**：分段控件，icon = `Moon` / `Sun`，选中态 accent。默认 Dark。
  - 列表项：Import Memory（Brain）、Manage Account（Settings）、Increase Concurrent（Zap，右侧 `New` chip）、Join Community（Discord SVG icon）
  - Sign Out（LogOut icon）
- 主题切换：
  - `index.tsx` 已硬加 `dark` class。改为读取 `useTheme` 自定义 hook（`localStorage.theme`），切换时给 `document.documentElement` 加/去 `dark`。
  - `src/styles.css` 在 `:root`（亮色）下定义白色主题 token：
    - `--background: oklch(1 0 0)`
    - `--surface: oklch(0.985 0 0)` / `--surface-2: oklch(0.965 0 0)`
    - `--foreground: oklch(0.18 0 0)` / `--muted-foreground: oklch(0.5 0 0)`
    - `--border: oklch(0.92 0 0)` / `--border-strong: oklch(0.86 0 0)`
    - `--accent` 保持 `#71F0F6`，但 `--accent-foreground` 改为 `oklch(0.18 0 0)` 以保证对比度。
  - 视觉风格匹配上传图 2（白底、深字、浅灰 surface、accent 不变）。
- 所有写 `kai`/`Kai`/`Victoria@gmail.com` 的位置统一改为 `Vic` 用户名（邮箱保留 Victoria@gmail.com）。

## 9. Gallery 适配多素材类型 + 连续剧集排布
- 新增 `taskKind` 推断：`adType` 字符串里含 `Episode|剧集|系列|EP|Series` → `taskKind = 'series'`，否则 `'oneoff'`。
- `MediaRail.tsx` 重做分组逻辑：
  - **`oneoff`**（广告/单片）：现有 Images / Videos 双分组保留。
  - **`series`**：按 `episode` 字段（Asset 新增可选 `episode?: number`）二级分组：
    - 一级 = Episode 1 / Episode 2 …（可折叠 Collapse）
    - 二级 = Scene 排序（Asset 增加 `scene?: number`），同 scene 内 image+video 横向并列（图为关键帧、video 为成片），缩略图 + 角标 `EP1·S03`。
    - 顶部 sticky filter bar：`All / Images / Videos`，左侧 episode 快速跳转下拉。
  - 排布方式：每个 Episode 内用 2 列网格，poster 大缩略图（16:9 或 9:16 自适应），右下角播放角标；点击 → focus + 在 workspace 滚动到对应 stage。
  - 时间轴模式：series 时增加一个 horizontal scrubber，按 episode 顺序展示所有 V0x，类似剧集播放队列。
- 在 `samples.ts` 增加一组 series 演示数据（`?state=series-demo`），便于验收。

## 10. 修复中途闪退回首页 bug
- 怀疑根因：
  1. `src/routes/index.tsx` 中 `useEffect` 调用 `forceState(s)`，但当 URL 不变、组件因 strict mode/HMR 重渲染时不会触发；安全。
  2. 真实原因可能在 `cancel` / `reset` 路径或 ApprovalChips 异步回调里：当 stage 还在 running 但 `phase` 被错误置回 `empty`。检查发现 `runDetails` 完成后 `phase: 'done'` 正确，但若用户在 thinking 阶段再次按 send，`submit()` 会 `clearTimers` 然后 set phase=thinking → 旧 schedule 已被清，OK；但 `taskHistory` 与新建 task id 若 collision，可能令 selector 找不到 task → workspace 强制返回 empty。
  3. 还有一个真实问题：`Sidebar` 的 `New task` 按钮直接 `reset()`；当用户在生成过程中误触会回到 empty。改为 `if (phase !== 'empty') { confirm('当前任务正在进行，确认开启新任务？') }`，并把 reset 改为先把当前 task 标记为 `interrupted` 存入 history，再清空 phase（避免数据丢失被误判为"闪退"）。
- 修复动作：
  - `Workspace` 内增加 ErrorBoundary（`react-error-boundary` 替代手写），捕获子组件运行时错误时不卸载根节点，只在内容区显示 "Something went wrong · Retry"，避免渲染异常导致 `phase` 视觉上"回到首页"。
  - `store.ts` 增加 `assertPhase` 守卫：所有 schedule 内 setter 在执行前 `if (get().phase !== 'running') return`，避免 race 把已 reset 的 store 写回 running 之后 UI 抖动。
  - 监听 `beforeunload` / `visibilitychange` 不清状态（确保 tab 切回不重置）。
  - 增加 e2e 风格手动验证：连发 3 次 submit + 中途 cancel + 切换 autoMode + new task，应无回到 empty 的现象。

---

## 技术细节

### 新增文件
- `src/components/sc/AttachMenu.tsx`
- `src/components/sc/AttachmentChips.tsx`
- `src/components/sc/MentionPopover.tsx`
- `src/components/sc/PulseDot.tsx`
- `src/components/sc/BrandIcons.tsx`（Claude / Google / OpenAI 三个 SVG）
- `src/components/sc/UserHoverCard.tsx`
- `src/components/sc/ThemeToggle.tsx`
- `src/hooks/use-theme.ts`
- `src/hooks/use-task-history.ts`

### 修改文件
- `src/components/sc/ModelMenu.tsx`（接入 BrandIcons）
- `src/components/sc/AutoRunMenu.tsx`（side=bottom + label 反馈）
- `src/components/sc/Sidebar.tsx`（折叠 + Tasks 真实历史 + Pricing 新样式 + UserHoverCard）
- `src/components/sc/CommandInput.tsx`（接入 AttachMenu + @mention + AttachmentChips）
- `src/components/sc/DotGridBackground.tsx`（光标跟随 + 全局背景化）
- `src/components/sc/Workspace.tsx`（背景持续显示 + ErrorBoundary）
- `src/components/sc/MediaRail.tsx`（series/oneoff 分支 + 时间轴）
- `src/lib/sc/store.ts`（autoMode 真实影响流程、taskHistory、assertPhase 守卫、attachments、mentions、taskKind）
- `src/lib/sc/types.ts`（新增 `Attachment`、`Task`、`Asset.episode/scene`、`TaskKind`）
- `src/lib/sc/samples.ts`（series-demo 数据）
- `src/styles.css`（亮色 token + pulseRing keyframes）
- `src/routes/index.tsx`（接入 use-theme 替换硬编码 dark）

### 不改动
- 路由结构、TanStack Start 配置、accent #71F0F6、Logo 设计、整体三栏布局。
- 已有 `?state=` 调试入口保留，新增 `series-demo`。

## 验收
1. 模型下拉里 Claude / Google / OpenAI 都是品牌真实 logo（橙色 8 角星、彩色 G、黑色花瓣）。
2. Auto Run 菜单向下弹出；选 Auto 后流程跳过 intake & gate；选 Confirm 后必须双确认；trigger label 显示当前模式。
3. 侧栏顶部 chevron 可点击，宽度 228↔56 丝滑过渡 300ms；折叠态 hover 显示 Tooltip。
4. Tasks 区从真实历史读取；运行中的任务右侧显示闪烁蓝色圆点（pulse ring 动画）；不再有 Needs approval 默认 chip。
5. + 加号可上传 image/video 或粘贴 URL；附件以缩略图 chip 显示；输入框输入 @ 弹出 mention 浮层并可插入 token。
6. 整个 Workspace 背景为光标跟随 dot grid，光标周围 dot 高亮 accent 并放大。
7. Pricing 按钮 rounded-2xl，icon=Gem accent，51% OFF tag accent 色填充。
8. 鼠标 hover 左下角用户行弹出按图 1 的 popover；Dark/Light toggle 切换主题，亮色匹配图 2；所有用户名显示 Vic。
9. Gallery 在 series 任务下按 Episode → Scene 二级分组，单片任务保持 Images/Videos 双组；series 顶部有时间轴。
10. 任意时刻（thinking/running/cancel/new task 切换）UI 不再无故回到 empty；运行中误触 New task 弹确认。
