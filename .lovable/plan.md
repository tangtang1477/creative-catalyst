# 实施计划

## 1. 主题切换滑动胶囊（仅修复 popup 内）

**问题**：`UserHoverCard.tsx` popup 内的 pill 视觉上还是"两按钮+背景跳变"，不是顺滑滑动。Sidebar 底部那个独立 Moon/Sun icon 按钮**不动**。

**改动 `src/components/sc/UserHoverCard.tsx`** — 仅 popup 内的主题切换块：

```tsx
<div className="relative mt-2 inline-flex w-full items-center rounded-full bg-surface-2 p-0.5">
  {/* 滑块：left+translateX 组合，避免百分比换算误差导致的端点偏移 */}
  <span
    aria-hidden
    className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,.15)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
    style={{ transform: theme === "light" ? "translateX(100%)" : "translateX(0)" }}
  />
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setTheme("dark"); }}
    className={cn(
      "relative z-10 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors",
      theme === "dark" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Moon className="h-3.5 w-3.5" /> Dark
  </button>
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setTheme("light"); }}
    className={cn(
      "relative z-10 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors",
      theme === "light" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Sun className="h-3.5 w-3.5" /> Light
  </button>
</div>
```

要点：
- 滑块用 `left:0.5 + translateX(100%)`（移动自身宽度=50%-2px）替代原本 `w-[calc(50%-4px)]` + `translateX(100%)`（结果=50%-4px，端点偏内 4px 不贴边）
- transition 用 `cubic-bezier(.4,0,.2,1)` 更顺滑
- 按钮 `stopPropagation` 防止冒泡关闭 hover card

Sidebar 底部 collapsed/expanded 行内的单个 Moon/Sun icon 按钮**保持不变**。

---

## 2. 阶段容器改为参考视频的扁平流式样式

**当前问题**：`StageRow.tsx` 把每个阶段渲染成 `rounded-2xl border bg-surface` 卡片 + 嵌套的 `rounded-xl border bg-background/40` details 卡片。视觉上块块割裂，和参考视频里的"会话流"（小方块 icon + 标题 + 直接平铺内容，无边框）完全不同。

**参考视频的样式特征**（v2/v3 多帧确认）：
- 阶段标题 = 16-20px 圆角填充小方块 icon（accent 青色，内嵌白色 sparkle/icon）+ 标题文字 + 末尾小 expand 外链 icon
- 标题下方直接平铺：纯文字段落、内联问题 chips、`Generating/Queued` 缩略图小方格、"Status checked 2 generations"、"Using skill xxx"、"Generation Started"、"Upload failed"、"Running terminal"、"Uploaded 3 files" 等子事件都是**纯文本行+小 icon**，无 border/bg
- 整个阶段没有外框，只靠"小 icon+标题"作为分段锚点，内容在主流里和上下文连续

### 2.1 重写 `src/components/sc/StageRow.tsx`

去掉外层 `rounded-2xl border bg-surface` 容器：

```tsx
<section data-stage-id={id} className="[animation:stream-fade_320ms_ease-out_both]">
  <button
    type="button"
    onClick={() => toggleStage(id)}
    className="group flex w-full items-center gap-2 py-1.5 text-left"
  >
    <span className={cn(
      "flex h-5 w-5 items-center justify-center rounded-md transition-colors",
      state.status === "running" || state.status === "recovering"
        ? "bg-accent/20 text-accent"
        : state.status === "ready"
          ? "bg-accent text-background"
          : state.status === "failed"
            ? "bg-status-failed/20 text-status-failed"
            : "bg-surface-2 text-muted-foreground"
    )}>
      <Icon className="h-3 w-3" />
    </span>
    <span className="text-[13.5px] font-medium tracking-tight">{STAGE_LABEL[id]}</span>
    {state.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-status-generating" />}
    {state.status === "recovering" && <RotateCw className="h-3 w-3 animate-spin text-status-recovering" />}
    {state.status === "ready" && <Check className="h-3 w-3 text-status-ready" />}
    {state.status === "failed" && <AlertCircle className="h-3 w-3 text-status-failed" />}
    <ChevronDown className={cn(
      "ml-auto h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition-all group-hover:opacity-100",
      expanded && "rotate-180 opacity-100"
    )} />
  </button>

  {/* 子事件流（toolCalls/thoughts/summary）— 折叠时只显示最后一条 summary */}
  {expanded ? (
    <div className="space-y-1 pl-7">
      {state.toolCalls.map((tc) => <ToolCallLine key={tc.id} call={tc} />)}
      {state.thoughts.map((th) => <ThinkingBlock key={th.id} thought={th} />)}
      {state.summary.map((s, i) => (
        <div key={`${i}-${s.slice(0,8)}`} className="text-[12.5px] leading-relaxed text-muted-foreground [animation:stream-fade_320ms_ease-out_both]">
          {s}
        </div>
      ))}
    </div>
  ) : state.summary.length > 0 && (
    <div className="pl-7 truncate text-[12px] text-muted-foreground">
      {state.summary[state.summary.length - 1]}
    </div>
  )}

  {/* 主内容（children/details）— 直接平铺，无 border/bg 包裹 */}
  {(expanded || keepChildrenWhenCollapsed) && children && (
    <div className="mt-1.5 pl-7">{children}</div>
  )}

  {expanded && details && (
    <details className="group mt-1.5 pl-7">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] text-muted-foreground/80 hover:text-foreground">
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        {detailsLabel}
      </summary>
      <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{details}</div>
    </details>
  )}
</section>
```

要点：
- 无 border、无背景色、无外圆角
- 标题前 20px 小方块 icon：`bg-accent`（ready）/`bg-accent/20`（running/recovering）/`bg-surface-2`（其它）
- 内容统一 `pl-7` 与标题文字对齐
- expand chevron 默认隐藏，hover 或展开时显示
- ready 阶段默认折叠到一行 summary，点击展开；running/recovering 阶段保持自动展开（store 已有逻辑）
- props 接口完全不变，`Workspace.tsx` 调用处零改动

### 2.2 `ToolCallLine.tsx` 改为扁平行

去掉外层 border/bg：纯 `flex items-center gap-1.5 py-0.5 text-[12px] text-muted-foreground`，前置小 icon（✦ 或 Loader2），文字直接显示 "Using skill xxx"、"Running terminal"、"Uploaded 3 files"、"Generation Started"、"Status checked 2 generations"，匹配参考视频。

### 2.3 `ThinkingBlock.tsx` 调整

- 折叠态：单行 `✦ Thinking…` / `✦ Thought for Ns`，纯文字无 border
- 展开态：内容直接平铺（去掉嵌套 border/bg），思考过程结尾的素材缩略图保持现有展示

### 2.4 `Workspace.tsx` 阶段间距

第 147 行 `<div className="flex-1 space-y-3">` → `space-y-5`（无 border 后需要更大的垂直间距区分阶段）。

### 2.5 保留的功能

- 点击标题 `toggleStage` 展开/收起
- summary 流式滚入动画
- `ApprovalChips`/`IntakeCard` 问题块样式不动（它们本来就是参考视频里的卡片块）
- `Generation Started`/`Status checked N generations`/`Upload failed`/`Uploaded N files` 通过 `ToolCallLine` 扁平样式自然实现

---

## 技术备注

- 不引入新依赖
- 颜色全走现有 token：`bg-accent`/`bg-surface-2`/`text-muted-foreground`/`border-border`/`text-status-*`
- 主题滑块用 `left+translateX` 组合避免百分比误差
- `StageRow` 重写保留 props 接口（`id`/`state`/`children`/`details`/`detailsLabel`/`keepChildrenWhenCollapsed`），`Workspace.tsx` 调用处零改动
- 验证步骤：
  1. 打开 popup 内主题胶囊，滑块平滑左右滑动 300ms，端点贴边
  2. 跑一个新任务，观察阶段没有卡片边框，只看到"小青色方块+标题+流式内容"
  3. 点击 ready 阶段标题，能展开/收起 toolCalls + thoughts + summary
