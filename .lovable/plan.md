## 目标

修掉 5 个一致性问题，让 Vibe Aideo 的流水线真正跟着用户输入跑，并把 Auto 模式也变成"15s 内不操作就继续"的确认流。

---

## 1. 剧本/前置阶段仍是"香水/YSL"问题

根因有两处：
- **AI 输出**：`script.functions.ts` 的 system prompt 已禁 YSL，但只是负面词，模型仍漂移。需要在 prompt 里把用户原始 prompt 放在最顶部并强约束输出主题词必须命中用户主题，加 1 条反例 few-shot。
- **前端硬编码**：流水线里有写死的"YSL/巴黎/暮蓝/烛火"，即使 AI 给出正确剧本也会被覆盖：
  - `store.ts:363` Building the scene 默认 summary "镜头语言：缓推 + 侧跟 + 微距旋转" — 改成读 `script.cameraLanguage`，没有就用 brief.prompt 派生的一句通用描述。
  - `store.ts:497-503` Paint 阶段 thought 文案"暮蓝主光 + 烛火点缀"等 — 改成读 `script.shots` 的 motion/scene/elements 自动汇总（"基于 W01/W02/P01，将生成 N 个关键帧，构图/光照依据 {script.mood}"）。
  - `samples.ts` 的 `STORYBOARD_ROWS` / `KEYFRAME_PROMPT_DETAIL` / `SCRIPT_ROWS` 含 YSL 文案 — 作为 fallback 时不要直接拼到 prompt。把 paint 阶段 fallback 的 `KEYFRAME_PROMPT_DETAIL` 拼接改成只用 `brief.prompt + shot.scene/motion/elements`（参考样板只在没有任何用户 brief 时才用，且改成中性"商品/人物特写"占位）。
  - `store.ts:1316` Demo 入口 "Demo: YSL Libre 30s" → 改成中性 demo（例如 "Demo: 城市晚风 30s"）。

## 2. Wardrobe 必须显式确认（不能 auto 直接进 Paint）

`runWardrobe` 完成后目前只有 confirm 模式下才 `openGate("wardrobe")`，auto 模式直接 `runPaint`。改成：
- 不管 auto / confirm，都 `openGate("wardrobe", () => runPaint())`，由 softGate 倒计时托底（见 §5）。
- 确认 UI 已经存在（`ApprovalChips` + `gate==="wardrobe"`），无需新增组件，只需让它在 auto 模式也出现。

## 3. Loader 改蓝色 + 更动感

改 `src/components/sc/GradientLoader.tsx`：
- 三块 aurora blob 颜色从 `--accent / --status-recovering / --status-processing`（青绿系）换成蓝色梯度：深靛蓝 `oklch(0.45 0.18 265)` + 电光蓝 `oklch(0.7 0.2 250)` + 冰青蓝 `oklch(0.85 0.12 220)`，统一在 `styles.css` 新增 `--loader-blue-1/2/3` 三个 token。
- 动效更强：
  - aurora 动画时长 7s/9s/11s → 4s/5s/6.5s，曲线改 `cubic-bezier(.4,0,.2,1)`，加 scale 1→1.2 抖动。
  - 中心环：从单层 `animate-spin` 改成"双层反向旋转 + 外圈进度 dash"，dash 用 `stroke-dasharray` 动态滚动。
  - 增加一条横向 shimmer 高光条（绝对定位，3s 周期从左滑到右），制造"流动"感。

## 4. QC 阶段接入真后端（不再 setTimeout 假修正）

当前 `runQC` / `applyQCFixInternal` 全是 `schedule(...)` 假流程。改成：

新建 **`src/lib/qc.functions.ts`**：
- `checkConsistency` server fn (POST)：入参 `{ shots: { id, url, scene, elements }[], brief }`。调用 Lovable AI `google/gemini-2.5-flash`（多模态，传 `image_url`），通过 tool calling 返回结构化 `{ issues: { shotId, dimension: '角色'|'场景'|'服装'|'故事'|'幻觉'|'合规', severity, suggestion, fixPrompt }[], passedDimensions: string[] }`。
- 缺 LOVABLE_API_KEY 时降级返回 `{ issues: [], passedDimensions: [...] }` 不中断流程。

store 的 `runQC`：
- 串行 streamLines 改为：发起 `checkConsistency`，等真实结果再 `appendSummary` "发现 N 处问题" 或 "全部通过"。
- 6 个维度 chip 来自 `passedDimensions` + `issues[].dimension`，不再写死。

store 的 `applyQCFixInternal`：
- 对每个 issue.shotId，调用 `streamGenerateImage`（已有）用 `fixPrompt + 原 scene + brief.prompt` 重新生成图，覆盖该 shot 的 asset url（替换原本只跑动画的假流程）。
- 真实失败时降级到"保留原样"并写明原因。

## 5. Auto 模式 = 15s 倒计时确认（每个关键节点）

在 store.ts 集中改：
- `openGate` 中的 `fireAt: Date.now() + 20000` → `15000`，schedule 的延迟同步成 15000。
- 三个"现在 auto 直接 schedule 下一步"的位置统一改成"无论 auto/confirm 都 openGate"：
  1. `runStructure` 完成 → `openGate("script", () => runWardrobe())`
  2. `runWardrobe` 完成 → `openGate("wardrobe", () => runPaint())`（§2）
  3. `runPaint` 完成 → `openGate("keyframe", () => runQC())`
  4. `runQC` 完成且有 issues → `openGate("qc-fix", () => applyQCFixInternal())`
- UI 已通过 `softGate.fireAt` 计算倒计时；只需确认 `ApprovalChips`/`gate` 文案显示"15s 后自动继续"。如果当前显示的是 20s，把硬编码常量也改成 15。

---

## 文件变更

- 修改：`src/lib/script.functions.ts`（强化 system prompt + 反例）
- 修改：`src/lib/sc/store.ts`（去硬编码文案、wardrobe gate、auto 全部走 gate、QC 接真后端、demo 文案）
- 修改：`src/lib/sc/samples.ts`（fallback 文案中性化）
- 修改：`src/components/sc/GradientLoader.tsx`（蓝色 + 更动感）
- 修改：`src/styles.css`（新增 `--loader-blue-*` token + 新 aurora keyframes）
- 修改：`src/components/sc/ApprovalChips.tsx`（如显示 "20s" 文案则改 "15s"）
- 新建：`src/lib/qc.functions.ts`（一致性检查 server fn）

完成后跑构建验证。
