## 改动范围

### 1. Paint 阶段生成多个分镜（A01…A0N）
**文件**：`src/lib/sc/store.ts`（`runPaint`）、`src/components/sc/Workspace.tsx`、`src/components/sc/AssetCard.tsx`（如需 grid 容器）

- 不再只生成 `A01`，改为根据 `STORYBOARD_ROWS` 数量生成 5 个关键帧 `A01–A05`（每个对应一个 storyboard shot，caption 来自 `r.shot / r.scene`）。
- 流式逻辑：
  - 串行排队：每帧 `Queued → Generating → Processing → Ready`，相邻起跳间隔约 700ms，单帧耗时约 2.4s。
  - 每帧 Ready 时调用 `consume("paint", "Keyframe Axx · MovieFlow", 5)`，并 `appendSummary` 一行 "Axx Ready"。
  - 全部 Ready 后写一条 "5 个关键帧已就绪 · 锁定为 V01–V05 的 image_url"，再进入 `runQC`。
  - 总成本：5×5 = 25 credits（同时调整 `runLife` 的 `canAfford` 判断仍用 30，使在剩余积分不够时触发 low-credit）。
- `Workspace.tsx`：`paint` 段落把单个 `AssetCard` 换为 5 张缩略图的 grid（沿用已有 `AssetThumbCard` 或 2 列 `AssetCard`，4:5 比例），点击单卡可 `flashAsset` 到 Rail。
- `paint` 阶段的 thought（"基于服装/道具素材生成分镜"）保留，body 改为说明"将分批生成 5 个关键帧覆盖 5 个镜头"。

### 2. Low-credit 提示从内联块改为 pill 样式（图 1 替代图 2）
**文件**：新增 `src/components/sc/credits/InlineLowCredit.tsx`，编辑 `src/lib/sc/store.ts`（`runLife` 失败分支）、`src/components/sc/Workspace.tsx`（`life` 渲染）

- 当 `runLife` 中 `canAfford(30)` 为 false 时，不再把整段说明 push 到 `summary`，而是设置一条新字段 `stages.life.details = "low-credit"` 或在 stage 里加 `summary: []` + 由 Workspace 检测 `phase === "failed" && st.status === "recovering"` 且 `life` 阶段时渲染 `<InlineLowCredit />`。
  - 简化方案：保留 `status: "recovering"`，`summary` 留空；在 `Workspace.tsx` 的 `life` 分支增加：当 `phase === "failed" && useCredits.remaining < 30` 时，把 `StageRow` 的 children 换成 `<InlineLowCredit onTopUp={openPricing} />`，并隐藏 `Recovery notes` 折叠条。
- `InlineLowCredit.tsx`：与 `LowCreditToast` 完全一致的胶囊样式（圆形菱形图标 + 标题 + "仅剩 X · 无法继续渲染" + `Top Up` 按钮 + `X` 关闭），但作为 stage 内联块（无 `fixed` 定位，宽度 `w-full`），点击 `Top Up` 触发 `openPricing()`。
- 同时保留右下角 toast；两者使用同一组件 + `variant: "toast" | "inline"`，避免重复 JSX。

### 3. 进入运行后，底部输入框改为"当前任务聊天"
**文件**：`src/components/sc/CommandInput.tsx`、`src/lib/sc/store.ts`

- `CommandInput` 新增 prop `mode: "compose" | "chat"`（或读取 `phase` 自行判断）：
  - 当 `phase` ∈ {`thinking`, `intake`, `running`, `done`, `failed`} 且非空时，进入 chat 模式：
    - 关闭 typewriter（`useTypewriter = false`）。
    - placeholder 改为「向当前任务发送指令，例如 "把 A03 的妆容再淡一些" / "把第 2 镜改成日光"」。
    - 提交时不再调用 `submit()` 启动新任务，而是调用新的 store action `chatMessage(text)`。
- `Workspace.tsx`：在底部 `CommandInput` 上方，渲染一个轻量 chat 时间线（仅展示用户消息 + agent 回执 chip）。最小实现：复用已有的右对齐气泡样式，把消息列表存在 store 的 `chatLog: {role, text, ts}[]`。
- 新 store action `chatMessage(text)`：
  - push `{role: "user", text}` 进 `chatLog`。
  - 简单模拟 agent 回执：1200ms 后 push `{role: "agent", text: "已收到，将在下一步纳入"}`。
  - 不触发流程重启。
- `submit()` 仍由 `phase === "empty"` 时调用（首页 hero 输入框继续走 compose 流程）。

### 4. UserHoverCard 顶部头像与左下角统一 + 加积分环
**文件**：`src/components/sc/UserHoverCard.tsx`

- 删除当前顶部 `div.bg-[radial-gradient(...)]` 的绿色头像。
- 替换为与 `Sidebar` 触发器一致的：`<CreditRing size={40} stroke={2.5}>` 包裹 `from-status-ready to-accent` 渐变 + 字母 "V"。
- 在头像右侧 workspace 文案下方追加一行迷你进度条（沿用 `CreditsHoverPanel` 中 20 点 dot 进度条的 12-点简版，或一根 2px gradient bar：`remaining/total` 比例填充 `var(--accent)`，剩余 `var(--border)`）。
- 保留下方完整 `CreditsHoverPanel`，仅作为头部呼应不重复。

## 技术细节

- 多帧成本调节：`runPaint` 5×5=25 与 `runLife` 30 之和 55，触发 low-credit 路径仍可靠（默认剩余 ≈ 58 - 1(scene) - 3(structure) - 6(wardrobe) - 25(paint) = 23 < 30 → 自然触发图 1 样式）。
- `chatLog` 加入 `SCState` 与 `reset()` 清空；不持久化到 `taskHistory`（避免污染快照结构）。
- `InlineLowCredit` 与 `LowCreditToast` 共享一个 presentational `LowCreditPill` 组件，toast 套 `fixed bottom-5 right-5`，inline 套 `w-full`。
- Paint 多卡 grid：`grid grid-cols-2 sm:grid-cols-3 gap-2`，单卡 4:5 占位骨架在 `Generating/Processing` 时显示 shimmer。

## 不在本次改动

- Auto/Confirm 20s 倒计时、Mention `@` 行为、思考块视觉等已在前几轮完成，本次不动。
- `taskHistory` 结构、Rail 宽度交互保持不变。