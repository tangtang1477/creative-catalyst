## 一、品牌与文案替换
- 全局把 `Supercomputer` 替换为 `Vibe Aideo`（涉及 `Sidebar.tsx` 标题、`taskTitle` 默认值、注释、`plan.md` 描述等）。
- Greeting 文案改为 `Vic, what are we creating today?`；store 中 user 名（侧栏邮箱区）改为 `Victoria` / `Victoria@gmail.com`。
- 侧栏底部用户区已有 truncate 省略号，**新增 hover 时用 Tooltip（shadcn `tooltip.tsx`）展示完整 `Victoria@gmail.com` 与昵称**。

## 二、Logo 替换为玻璃 M
- 把 `user-uploads://透明背景玻璃质感M字母logo.png` 复制到 `src/assets/logo-m.png`。
- 新增 `src/components/sc/Logo.tsx`：渲染 `<img>`，尺寸 24×24，带可选 `loading` prop。
- `loading=true` 时叠加 CSS 动画 `@keyframes logoShimmer`：透明度 `0.55 → 1 → 0.55` + `drop-shadow` 在 `0 0 0` 与 `0 0 12px hsl(var(--accent))` 间脉动，1.4s ease-in-out infinite。
- 替换位置：Sidebar 顶部、Workspace 顶 bar `Sparkles` 占位、Empty state 大图标（48×48）。任何 `phase==='running'` 的阶段都把 logo 切到 loading 态。

## 三、主题色 #71F0F6
- `src/styles.css` 把 `--accent` 改为 `oklch(0.87 0.12 195)`（≈#71F0F6），`--accent-foreground` 取近黑；同步更新 `--ring` 与 `--status-generating` 使用 accent。
- 旧 `oklch(0.78 0.12 195)` 全部清掉。验证 SCButton primary、chip selected、focus ring、StatusBadge generating、StageRow 进行中线条色都跟着变。

## 四、Empty 背景：鼠标跟随点阵
新建 `src/components/sc/DotGridBackground.tsx`，移植自 `AI Video Weaver` 的 `DotGrid.tsx`：
- canvas 全屏绝对定位（`absolute inset-0 pointer-events-none`），父容器监听 `mousemove`/`mouseleave` 写入 `mouseRef`。
- 每 24px 画一个白色点（基础 `rgba(255,255,255,0.06)`），距光标 90px 内做二次方衰减放大并提亮；亮区颜色用 accent `rgba(113,240,246,...)` 取代纯白以匹配主题。
- 仅在 `phase==='empty'` 时挂载（包裹 Greeting + CommandInput + SuggestionChips 的容器内），`phase` 切换后卸载停止 rAF。
- Workspace 在 empty 分支根容器加 `relative` 并把 DotGridBackground 放到内容下方一层。

## 五、按钮三态视觉重做
- 修改 `src/components/sc/Button.tsx` 的 cva：
  - 圆角统一 `rounded-xl`（chip/sm `rounded-lg` → `rounded-xl`，primary `rounded-md` → `rounded-xl`）。
  - `chip` 默认态：去掉 border，改 `bg-surface-2`（纯色），文字 `text-foreground/85`。
  - `chip` hover：`bg-accent/15 text-accent`，无 border，过渡 150ms。
  - `chip` active：`bg-accent/25 scale-[0.98]`。
  - `chip` selected：`bg-accent text-accent-foreground` 实色，去掉描边方案。
  - `outline` 变体保留但仅用于 sidebar Pricing；其它原 outline 用法换为新 `chip` 默认。
- IntakeCard、SuggestionChips、NextActionChips 的 chip 不再加额外 border 类。
- focus-visible 仍保留 2px accent ring，disabled 保留 `opacity-50`。

## 六、Prompt 驱动的智能 Intake
现状：IntakeCard 选项写死。改为根据用户 prompt 推断品类，动态注入相关候选。
- 新增 `src/lib/sc/intake-engine.ts`：
  - 关键词字典：`{ 汽车|car|轿车|SUV: ['汽车广告','试驾片'], 香水|fragrance|perfume: ['香水广告'], 美妆|cosmetic|口红: ['美妆广告'], 食品|饮料|coffee: ['食品广告'], 服装|时装|fashion: ['时尚大片'], 数码|手机|laptop: ['3C 数码广告'] }`。
  - `inferIntake(prompt)` 返回 `{ adType: string[], format: string[], visualSource: string[], mode: string[] }`，每组先放命中类目，再补 2-3 个相邻类目（例如「汽车广告」也带上「香水广告」「3C 数码广告」作为可切换备选），然后通用项兜底。
  - Format 始终含 `9:16 30s / 16:9 15s / 1:1 6s`；Visual source 含 `Generate from prompt / Use uploaded reference / Brand asset library`；Mode 含 `Auto / Guided / Manual`。
- IntakeCard 接受 `brief.prompt`，调用 `inferIntake` 渲染 chip 列表；首项默认选中。

## 七、首 token 加载延迟
- `store.ts` 的 `submit()`：在切到 `intake` 或 `running` 之前先进入新中间态 `phase==='thinking'`（800–1500ms 随机），期间 CommandInput 禁用 + 显示「Thinking…」气泡（带 logo loading shimmer）。
- 之后再按现有逻辑跳到 intake 或 running。所有 simulate 阶段在此之后才开始计时。
- Workspace 在 `phase==='thinking'` 渲染一个 ghost StageRow（"Building the scene" generating）以模拟首条流式回包。

## 八、阶段展开/收起规则（贴合视频）
对 `StageRow`：
- 新增 `autoCollapseOnReady` prop。规则：
  - **Building the scene / Structuring the film / Adding the details**：`status==='generating'` 时自动展开思考摘要；`ready` 后 1.2s 自动折叠（仅保留标题 + 1 行总结）。
  - **Painting the frame / Bringing it to life**：生成中展开（显示 prompt details、进度条、占位卡），`ready` 后**保留媒体可见**，但把 prompt/recovery 文本收回到 `<details>`。
- store 中每个 stage 增加 `expanded: boolean`，`setStageStatus('xxx','ready')` 后 setTimeout 1200ms 切 `expanded=false`（媒体不受影响，渲染独立判断）。
- 用户点击 chevron 可手动 toggle，覆盖自动行为。

## 九、需要用户确认的节点
- IntakeCard 的 Continue 是显式确认（保留）。
- 新增「Storyboard 确认条」：`structure` ready 后底部出现 `Approve script & continue / Tweak` 两个 chip；只有点 Approve 才开始 `paint`。`Tweak` 切回 intake 重选 format/mode。
- A01（keyframe）ready 后出现 `Use this keyframe / Regenerate` 两个 chip；只有 Use 才进入 `life` 阶段。
- 这两个 gating 通过 store 新增 `gates: { script:boolean, keyframe:boolean }` 控制 simulate 链是否继续。

## 十、首次素材出现自动展开 MediaRail
- store 新增 `rail: { open: boolean, focusedAssetId?: string }`。
- 当任意 asset 第一次进入 `ready`（A01 是首次），dispatch `openRail(asset.id)`。
- `MediaRail.tsx`：`<lg` 时为抽屉，`open` 触发滑入动画（`translate-x-full → 0`，250ms ease-out）。`>=lg` 时一直可见但首次出现做高亮闪动（accent ring 1.5s 一次后淡出）。
- 每张资产卡接受 `focusedAssetId`，匹配时滚动到视图并加 `ring-2 ring-accent`。

## 十一、MediaRail 信息排布（便于 navigate）
重新设计 `AssetCard` + Rail 布局：
```
┌────────────────────────────┐
│  [缩略 16:9 / 9:16 自适应] │
│  ▢ A01 · Keyframe          │  <- 编号 + 类型 chip
│  Status: Ready  · 1280×720 │
│  00:04 generated           │
│  [Open ▸] [Replace] [↧]    │  <- 三个 icon button
└────────────────────────────┘
```
- 顶部 sticky 分组标题：`Images (1)` / `Videos (1)`，点击 chevron 折叠分组。
- 每张卡 `onClick` → 中央 timeline 滚动到对应 StageRow 并高亮 1s（实现：StageRow 接受 `data-asset-id`，rail 调 `scrollIntoView({ block:'center' })` + 临时加 `ring-2 ring-accent`）。
- 视频卡显示 `▶` 覆盖层 + 时长 badge；图片卡显示 `🅺` keyframe 标记。
- 底部固定 mini progress：`2 / 5 stages · 1 image · 1 video`。

## 十二、技术细节
- 所有改动只在前端：`src/components/sc/*`、`src/lib/sc/*`、`src/styles.css`、`src/routes/index.tsx`。
- 新建文件：`Logo.tsx`、`DotGridBackground.tsx`、`intake-engine.ts`、`ApprovalChips.tsx`。
- 修改：`Button.tsx`（变体）、`Sidebar.tsx`（logo + 邮箱 tooltip + Vibe Aideo）、`Workspace.tsx`（thinking 态 + DotGrid + gating）、`IntakeCard.tsx`（动态选项）、`StageRow.tsx`（auto-collapse）、`MediaRail.tsx`（自动展开 + 分组 + 跳转）、`AssetCard.tsx`（信息排布）、`store.ts`（thinking phase + gates + rail）、`samples.ts`（去掉硬编码品类）、`types.ts`（新 phase）、`styles.css`（accent 调色）。
- shadcn 组件复用：`tooltip` 用于邮箱、`collapsible` 已可继续用于 details。

## 十三、验收
1. 全站无「Supercomputer」字样，logo 是玻璃 M，loading 时呼吸闪烁。
2. Greeting 显示 `Vic, what are we creating today?`，左下角邮箱 hover 完整展开。
3. 主题色取色卡是 #71F0F6（hover/selected/ring/status 一致）。
4. Empty 状态鼠标移动有点阵高亮跟随，离开淡出。
5. 输入「汽车广告」后 1–2s 出现 thinking → intake，候选包含汽车 + 香水 + 数码相邻品类；输入「香水」时香水排首位。
6. 所有按钮默认无描边、圆角 ≥12px、hover 高亮、active 缩放、focus 有 ring、disabled 灰显。
7. 思考型阶段 ready 后自动收起摘要；媒体阶段保留资产可见。
8. Script ready 与 A01 ready 都有显式确认 chip 才推进。
9. 首张 A01 出现时右侧 MediaRail 自动展开 + 高亮闪一次；点击卡片能跳到中央对应阶段。
10. Rail 卡片含编号、类型、尺寸、时长、状态、操作按钮，分组清晰。