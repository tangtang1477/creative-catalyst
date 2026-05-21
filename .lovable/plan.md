
## 目标

在 TanStack Start + React + TypeScript + Tailwind 的现有模板上，构建一个深色、紧凑、专业的 AI 广告视频 agent 工作台界面，复刻视频中 Higgsfield Supercomputer 的视觉与交互。**纯前端 + 模拟数据**，不接入真实 MovieFlow API，但严格遵循 skill 中规定的阶段标签、状态、卡片结构与折叠规则。

---

## 路由与文件结构

```
src/routes/
  index.tsx                  # 主工作台（初始 + 任务）
src/components/sc/           # Supercomputer 组件命名空间
  Sidebar.tsx
  CommandInput.tsx           # 输入栏 + 模型选择 + Auto Run + 发送按钮
  SuggestionChips.tsx        # Build website / Create UGC / Run marketing ...
  Greeting.tsx               # "Kai, what are we creating today?"
  IntakeCard.tsx             # 4 组 chip + Skip/Continue
  StageRow.tsx               # 通用阶段块（图标 + 标题 + 1-3 bullet + 折叠详情）
  AssetCard.tsx              # A01 Keyframe / V01 Video 卡片
  MediaRail.tsx              # 右侧预览栏
  DetailsAccordion.tsx
  StatusBadge.tsx            # Generating/Queued/Processing/Status checked/Ready/Recovering/Failed
  QualityCheck.tsx
  ScriptTable.tsx
  StoryboardTable.tsx
  NextActionChips.tsx
src/components/sc/icons.tsx  # 五个 stage 的小图标
src/lib/sc/
  types.ts                   # Stage / AssetStatus / Brief 等类型
  store.ts                   # Zustand：会话、阶段状态、资产、计时器
  simulate.ts                # 模拟 Generating→Processing→Ready 时间线
  samples.ts                 # 占位图/视频 URL，脚本/分镜样例数据
```

只在 `src/routes/index.tsx` 渲染整个工作台（侧边栏 + 中央时间线 + 右侧 rail）。

---

## 视觉系统（src/styles.css）

切换为深色模式作为默认（在 `<html>` 加 `dark` class）。新增 oklch 语义 token：

- `--background`：近黑 `oklch(0.16 0.005 260)`
- `--surface`：面板 `oklch(0.20 0.006 260)`
- `--surface-2`：卡片 `oklch(0.235 0.006 260)`
- `--border`：`oklch(0.30 0.008 260)`
- `--foreground`：`oklch(0.95 0.005 260)`
- `--muted-foreground`：`oklch(0.65 0.01 260)`
- `--accent`（青色）：`oklch(0.78 0.12 195)` —— 活动按钮 / Ready / Continue
- `--accent-foreground`：`oklch(0.18 0.02 240)`
- 状态色：`--status-generating`（青）、`--status-processing`（琥珀）、`--status-ready`（绿）、`--status-failed`（红）、`--status-recovering`（紫）

圆角统一 6–8px（`--radius: 0.5rem`），字号偏小（13–14px 主，11–12px 辅），spacing 紧凑。

---

## 三态按钮规范（所有 button 必须满足）

在 `button.tsx` 上用 cva 扩展或新增 `sc` 变体，明确三态：

- **Default**：底色/边框/文字使用 token
- **Hover**：背景轻微 lift（`color-mix(... 8%)`）+ border 提亮
- **Active/Pressed**：背景再加深 + `scale-[0.98]` + inset shadow
- **Focus-visible**：2px ring（accent 色，offset 2px，bg 同 background）
- **Disabled**：`opacity-50 cursor-not-allowed`，禁用 hover/active

变体：`primary`（accent 实色）、`ghost`（透明）、`chip`（带选中态）、`icon`、`destructive`。Chip 额外有 **selected** 态（accent 描边 + 浅 accent 底）。Suggestion chip、intake chip、next action chip、Skip/Continue、Send、Cancel、Sidebar 项、Auto Run 切换，全部使用此规范。

---

## 状态管理（store.ts）

Zustand store：

```ts
session: {
  phase: 'empty' | 'intake' | 'running' | 'done' | 'failed',
  brief: { adType, format, visualSource, mode } | null,
  stages: Record<StageId, { status, summary[], details? }>,
  assets: { id, kind:'image'|'video', status, url?, label }[],
  cancelled: boolean,
}
```

`simulate.ts` 用 `setTimeout` 链推动：
- Building the scene（800ms ready）
- Structuring the film（1500ms，写入 script + storyboard）
- Painting the frame：A01 Generating → Processing → Ready（共约 4s），写入 thumbnail
- Bringing it to life：V01 Queued → Processing → Status checked → Ready（共约 6s）
- Adding the details：QC + next actions

支持 `cancel()` 中断当前阶段并把进行中的 asset 设为 Failed/Recovering。

---

## 交互流程

1. **Empty**：居中 Greeting + CommandInput + 6 个 SuggestionChips。
2. 提交后判断是否含 `全自动 / full-auto` 关键词：
   - 不含 → 渲染 IntakeCard（4 组 chip + Skip/Continue + `Awaiting your input` 状态行）。
   - 含 → 跳过 intake，直接进入 running。
3. **Running**：中央切换为竖向 timeline，按固定顺序渲染 5 个 StageRow，右侧 MediaRail 同步显示资产卡片（缩略 + StatusBadge）。
4. Painting the frame ready 后：中央和 rail 同时显示 keyframe 缩略图。
5. Bringing it to life ready 后：中央显示可播放 `<video controls poster>`（用 sample mp4），rail 显示视频卡。
6. Adding the details：QualityCheck + NextActionChips（A/B variant、字幕/旁白、封面图、改节奏、比例导出）。
7. Processing 期间 CommandInput 旁显示 **Cancel** 按钮（三态完整）。
8. DetailsAccordion 默认折叠：Prompt details / Recovery notes / Full scene plan。生成的媒体永远在折叠区之外。

---

## 必须支持的 UI 状态（可手动切换 demo）

在 sidebar 底部加一个隐藏的 dev 切换（或 URL `?state=`）来强制进入：empty / intake / running / image-generating / video-processing / ready / recovering / failed。便于验收。

---

## 占位资源

- 图片：`src/assets/sample-keyframe.jpg`（用 `imagegen` 生成一张深蓝调香水广告关键帧）
- 视频：`public/sample-ad.mp4`（用 1 个非常小的占位 mp4，或直接引用 sample bucket 的公开 URL；若不可得则只显示视频卡 + 静态海报并标注，但绝不把静图当视频）

---

## 技术细节

- 不动 `__root.tsx` 的 router/SSR 结构，只在 RootComponent 内确保 `dark` class。
- 替换 `src/routes/index.tsx` 中 PlaceholderIndex 为真实工作台。
- Sidebar 使用自建轻量组件（不引入 shadcn sidebar，保持紧凑度匹配视频）。
- 图标全部来自 `lucide-react`：`Plus, Search, Sparkles, Plug, FileText, Brain, CreditCard, Settings, ArrowUp, X, Check, Loader2, ChevronDown, Image, Film, Layers, PenTool, Wand2, Eye`。
- 响应式：`<lg` 时折叠 sidebar 为 icon rail，隐藏 MediaRail，timeline 全宽。

---

## 验收清单

1. 初始页一眼就是工作台（无 marketing hero）。
2. Greeting 文案精确为 `Kai, what are we creating today?`。
3. 6 个 suggestion chip 文案精确匹配。
4. Intake 4 组问题与 chip 文案精确匹配，含 Skip / Continue 与 `Awaiting your input` 行。
5. 5 个阶段标签按 skill 顺序固定渲染。
6. 资产状态文案使用 skill 列出的 Generating / Queued / Processing / Status checked / Ready / Recovering / Failed。
7. 图片就绪后中央 + rail 都可见缩略；视频就绪后是真实可播放 `<video>`，不是静图。
8. 所有 button 在 hover / active / focus / disabled 下视觉差异明显且一致。
9. Cancel 按钮在 processing 中可见且能将 store 切到 failed/recovering 状态。
10. DetailsAccordion 默认折叠，媒体永远在折叠外。
