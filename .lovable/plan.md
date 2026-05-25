
# 计划：积分体验 + Auto/Confirm 行为统一

## 一、积分体验（Credits System）

### 1. 数据层 `src/lib/sc/credits-store.ts`（新增 zustand store）
- 状态：`total: 100`、`used`、`history: { ts, stage, label, cost }[]`、`lowOpen: boolean`、`pricingOpen: boolean`、`hoverOpen: boolean`。
- 动作：`consume(stage, label, cost)` 累加并写入 history；`topUp(n)`；`reset()`；`openPricing/closePricing`；`openLow/closeLow`。
- 派生：`remaining = total - used`、`percent`、`isLow = percent <= 10`、`isCritical = remaining < 需要的成本`。
- 持久化：localStorage `sc.credits.v1`。

### 2. 在视频生成流程中真实消耗积分（`src/lib/sc/store.ts`）
在各 stage 关键节点调用 `useCredits.getState().consume(...)`，模拟真实消耗：

| Stage | 节点 | 消耗 |
|---|---|---|
| scene | 分析 brief | 1 |
| structure | 脚本 + 分镜 | 3 |
| wardrobe | 每个素材生成 | 2 × 3 |
| paint | A01 关键帧 | 5 |
| qc | 自查（快模型） | 0 |
| life (V01) | 视频整合 | **30** |
| details | 收尾 | 2 |

进入 `life` 阶段前先调用 `credits.canAfford(30)`：
- 不足 → `softGate` 暂停，弹出右下角"积分不足"卡片（图1 样式），不进入视频生成，直到用户充值或忽略。

### 3. 右上角 "Buy credits" → 打开 PricingDialog
`Workspace.tsx` 顶栏的 `Buy credits` 按钮改为 `onClick={openPricing}`。

### 4. 左下角 Pricing chip（Sidebar 中的"Pricing 51% OFF"）
绑定到 `openPricing`。

### 5. 新组件
- **`src/components/sc/credits/CreditRing.tsx`** — 包裹左下角头像的 SVG 进度环（参考图2），剩余/总额比例，低于 20% 转琥珀色，低于 10% 闪烁。
  - 集成到 `UserHoverCard.tsx` 的 trigger（头像外多一个 ring）。
- **`src/components/sc/credits/CreditsHoverPanel.tsx`** — 替换 `UserHoverCard` 内 Credits 块：
  - "Credits 58 left ›" 数字使用 `useCountUp` 在 `used` 变化时滚动动画。
  - 20 个 dot 进度条按 `remaining/total` 渐变填充，新被消耗的 dot 闪一下 accent 并淡出（CSS keyframe `credit-deplete`）。
  - 下方滚动展示最近 3 条 history（"−5 · Painting A01"），新增条目从上方滑入。
- **`src/components/sc/credits/PricingDialog.tsx`** — 全屏 Dialog，参考 5de8f9a1 "Subscription Experience Pro"：
  - 三档套餐 tab（Starter / Plus / Pro），月/年 toggle；
  - 卡片悬浮上浮 + glow；
  - "Continue" 主 CTA 调用 `topUp` 并关闭。
- **`src/components/sc/credits/LowCreditToast.tsx`** — 固定右下角胶囊，参考图1：
  - 左侧琥珀色 ◆ icon + "Credits are running low" + 灰色副标 "Over N% already used"；
  - 右侧 "Top Up"（白底）按钮 → 打开 PricingDialog；× 关闭；
  - 进入 `life` 阶段而 `remaining < 30` 时自动 `openLow()`；用户点 × 后该任务不再重弹，除非再次发起新任务。

### 6. 样式 token（`src/styles.css`）
新增 `--credit-low: oklch(0.78 0.16 75)`（琥珀），`--credit-critical: oklch(0.62 0.21 25)`；动画 `@keyframes credit-deplete`、`@keyframes credit-pulse`。

---

## 二、Auto / Confirm 模式行为统一

### 1. 修正核心规则（`store.ts`）
两种模式的**唯一区别**：是否带 20s 倒计时自动推进。其他流程**完全一致**：
- 提交首条 prompt 后**始终**进入 `phase: "intake"` 流式输出 4 个基础选项（视频类型 / 规格 / 画面来源 / 创作模式），无论 auto 还是 confirm。
- 在 `IntakeCard.tsx` 内新增 20s 软倒计时（仅 auto）：所有 4 题流式展示完毕后启动；倒计时归零自动调用 `confirmBrief` 提交当前 `intakeSel`（已用 defaults 预填）；用户任意点击/输入 → 取消倒计时。
- 删除/移除 `submit()` 中"auto 模式跳过 intake 直接 confirmBrief"的旁路（若存在）。检查 `intake-engine.ts` 与 `store.ts` 的 `submit` 流程并修正。

### 2. IntakeCard 倒计时 UI
在 `phase === "ready"` 的 Continue 行左侧加 `<Timer />` + "20s 后将按当前选择自动继续 · 我要确认"，与 `ApprovalChips.tsx` 现有样式保持一致。仅 `autoMode === "auto"` 显示。

### 3. CommandInput 发送按钮统一为 暂停/发送 切换
当前 `isProcessing` 仅判断 `phase === "running"`，需扩展为**整个生成与流式输出阶段**都显示方块暂停按钮：
- 判定条件改为：`isBusy = phase === "thinking" || phase === "intake" || phase === "running"` **或** 当前有未完成的 `softGate` 倒计时。
- 暂停按钮点击 → 调用 `cancel()`：
  - 清空所有 timers（`clearTimers()`）；
  - 取消 `softGate`；
  - 将当前 running 的 stage 标记为 `paused`（types 新增 `"paused"` status）或维持 running 但冻结；
  - **不**重置已生成的内容；
  - 切换按钮回 ArrowUp，用户输入新内容继续。
- 输入框在 busy 时仍保持可编辑（仅 thinking 阶段保留 disabled）。

### 4. ApprovalChips 软倒计时已存在 → 保持不动，仅确认 wardrobe / keyframe / qc-fix 三个 gate 在 `autoMode === "auto"` 下都会带 20s 倒计时（已实现，无改动）。

---

## 三、文件改动总览

**新增**
- `src/lib/sc/credits-store.ts`
- `src/components/sc/credits/CreditRing.tsx`
- `src/components/sc/credits/CreditsHoverPanel.tsx`
- `src/components/sc/credits/PricingDialog.tsx`
- `src/components/sc/credits/LowCreditToast.tsx`

**编辑**
- `src/components/sc/Workspace.tsx` — "Buy credits" 接 `openPricing`；挂载 `<PricingDialog />` 和 `<LowCreditToast />`。
- `src/components/sc/UserHoverCard.tsx` — 头像外加 `CreditRing`；Credits 块替换为 `CreditsHoverPanel`。
- `src/components/sc/Sidebar.tsx` — Pricing chip 接 `openPricing`。
- `src/components/sc/CommandInput.tsx` — `isBusy` 判定扩展；暂停按钮逻辑。
- `src/lib/sc/store.ts` — 各 stage 注入 `credits.consume(...)`；进入 `life` 前判 `canAfford(30)`；移除 auto 跳过 intake 旁路；`cancel()` 增强为可恢复暂停。
- `src/lib/sc/types.ts` — `StageStatus` 增 `"paused"`（如需）。
- `src/components/sc/IntakeCard.tsx` — 流式完成后启动 20s 软倒计时（仅 auto），UI 与 ApprovalChips 一致。
- `src/styles.css` — 新增 credit 相关 token 与 keyframes。

## 四、验收
1. 进入新任务：无论 auto/confirm 都先流式输出 4 个 intake 问题；auto 模式 20s 不操作自动确认进入流程。
2. 流程中左下角头像外圈进度随每次 consume 减少；hover 弹窗内 dot 进度条带 deplete 动画 + 历史滚动。
3. 进入 V01 整合视频前若 remaining < 30，右下角弹出图1 样式提示，点击 Top Up 打开 PricingDialog。
4. 右上角 Buy credits 与左下角 Pricing 51% OFF 均能打开同一 PricingDialog。
5. 在 thinking / intake / running 任意阶段，输入框右下角图标都是方块暂停；点击立即暂停所有 timer 和倒计时；用户输入新内容并发送可继续。
6. confirm 模式始终无倒计时，等待用户主动确认。
