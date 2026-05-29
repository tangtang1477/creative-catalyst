## 问题定位

**1. 剧本仍是 YSL 香水广告**
- `src/lib/script.functions.ts` 的 `generateScript` 已经能正确产出与"金毛摊煎饼"匹配的剧本，store 里也已经存到 `state.script`。
- 但是页面上展示的 `ScriptTable` / `StoryboardTable`（`src/components/sc/ScriptTable.tsx`）以及 `WardrobePanel`/`Painting the frame` 的 caption 仍然写死读 `SCRIPT_ROWS` / `STORYBOARD_ROWS`（`src/lib/sc/samples.ts` 里的 YSL Libre 假数据）。
- 因此后端虽接通，前端却没绑数据 → 看到的还是巴黎香水广告。Paint 阶段的图能跑出煎饼，是因为 `runPaint` 直接读了 `script.shots[].prompt`，但表格 + Wardrobe caption 没改。

**2. 视频时长不对（选了 15s 出了 5s）**
- IntakeCard 选的 `format` 是 `"15s · 9:16（推荐）"`，存进 `brief.format`，但 `runLife()` 调 `submitVideoTask` 时 payload 只传了 `prompt / image_url / ratio`，没传 `duration`。
- Seedance 默认 `sd2.0-fast` 没传 duration 就用最短的 5s。

**3. 失败后无法重做**
- `runLife`/`runPaint` 失败后 `phase` 被设为 `failed`、`assets` 状态变 `Failed`，store 没有暴露"重试当前阶段"的入口，AssetCard 里也没有 retry 按钮。

**4. Loading 动效太丑**
- 当前 `AssetCard` 在 `url` 为空时只显示纯文字"等待生成…"；视频和图像生成中的卡片都是同样的占位。
- 需要换成图 5 那种"渐变模糊光晕 + 中心细环"动效，统一应用到 image/video 的 `Queued / Generating / Processing / Recovering` 状态。

---

## 实施方案

### A. 让 Script/Storyboard/Wardrobe 真正使用 LLM 输出

1. **`src/components/sc/ScriptTable.tsx`**
   - 改成读 `useSC((s) => s.script)`。
   - 有 `script` 时：
     - 用 `script.shots` 直接渲染 Storyboard 表（shot / duration / motion / scene / elements）。
     - 用 `script.shots` 派生 Script 表（time 累加每段 duration、visual=scene、vo=空 or 简短提示、sound=mood/cameraLanguage 关键词）。
   - 无 `script` 时 fallback 到原 `SCRIPT_ROWS`/`STORYBOARD_ROWS`（保持 IntakeCard demo 不爆）。

2. **`src/components/sc/WardrobePanel.tsx`** 和 Paint 区的 caption
   - WardrobePanel 中的 W01/W02/P01 caption 改成读 `script?.wardrobe`。
   - Paint asset 的 `caption` 在 `runPaint` 里已用 `script` 的 scene，确认无 fallback 漏写。

3. **`Workspace.tsx` 的 `KEYFRAME_PROMPT_DETAIL`（Prompt details 折叠区）**
   - 替换为 `script?.shots[0]?.prompt`（或拼接全部 5 个 prompt），让"Prompt details"也跟随真实剧本，否则用户展开还是看到香水文案。

### B. 把所选时长传给 Seedance

1. **新增 `src/lib/sc/format-utils.ts`**：`parseFormatDuration(format: string): number` —— 用正则匹配 `^(\d+)s`，没匹配到默认返回 5。
2. **`src/lib/sc/store.ts` 的 `runLife()`**：在 `submitVideoTask` 的 `payload` 里加 `duration: parseFormatDuration(get().brief?.format)`。
3. **`src/lib/seedance.functions.ts`** 已在 schema 里允许 `duration: z.number().int().optional()`，无需改。
4. UI 里 V01 asset 的 `duration` 字段也改成 `\`0:${dur}\``。

### C. 失败可重做

1. **`store.ts` 新增 action**：
   - `retryStage(id: StageId)`：清掉该 stage 的 `assets`、把 stage 置回 `emptyStage()`、`phase` 回 `running`、重启 `runId`、调用对应的 `runPaint/runLife/runQC/...`。
   - `retryAsset(assetId: string)`：针对 paint 的某个关键帧（`A0x`）单独重生成；life 的 `V01` 走 `retryStage('life')`。
2. **`AssetCard.tsx`**：当 `asset.status === 'Failed'` 时在卡片上叠一个明显的 `Retry` 按钮（沿用现有 `Replace` 旁边的位置），点击调 `retryAsset(asset.id)`。
3. **`StageRow.tsx`**：当 `state.status === 'failed'` 时在标题右侧显示一个 `Retry stage` 小按钮。
4. **底部 CommandInput**：`phase === 'failed'` 时也允许发送新指令（已支持），但加一个 "Retry last stage" 的快捷 chip。

### D. 新的 Loading 动效（图 5 风格）

1. **新组件 `src/components/sc/GradientLoader.tsx`**
   - 圆角矩形，按父容器 fill；
   - 底层是 conic / radial gradient 用主题色 `--accent` + `--primary` + 深色背景，带 `animation: aurora 6s ease-in-out infinite` 缓慢漂移 + `blur(40px)`；
   - 中心一个 `border` 半圈细环（`border-t-transparent`）做 `animate-spin`，弱透明度；
   - 底部一个胶囊 `<span>` 显示 `● Generating image` / `● Generating video`，传 label prop。
   - 全部用 `bg-[radial-gradient(...)]` + `oklch` 中的 `--accent` / `--primary` 派生色，保证和主题协调。
2. **接入位置**（`AssetCard.tsx`）
   - 把当前 `等待生成… / 未返回可用 URL` 占位 div 整段替换为 `<GradientLoader label={...} variant={asset.kind} />`。
   - 触发条件：`!asset.url && (status in {Queued, Generating, Processing, Recovering})`，`Failed` 显示错误占位 + Retry 按钮。
   - 图像/视频 aspect-ratio 维持原来（9/16 / 16/9）。
3. **CSS 动画**：在 `src/styles.css` 增加 `@keyframes aurora { 0%,100% {transform: translate3d(0,0,0) scale(1)} 50% {transform: translate3d(4%,-3%,0) scale(1.15)} }` 等关键帧。

---

## 验证

- 输入"金毛摊煎饼"，重新跑：Structure 表格、Storyboard、Wardrobe caption、Prompt details 全部出现煎饼/金毛相关文案，无任何 YSL/巴黎字样。
- Intake 选 `15s · 9:16` 后跑完，V01 视频时长 ≈ 15s（Seedance 返回 duration 字段或目测）。
- 在 paint/life 阶段制造失败（比如断网一次），出现 Retry 按钮，点击后能从该阶段重新跑通。
- 图像/视频卡片在生成期间显示新的渐变模糊光晕 + 细环 + 胶囊文案，颜色与现有 accent 主题协调；生成完成后顺滑切到真实图/视频。
