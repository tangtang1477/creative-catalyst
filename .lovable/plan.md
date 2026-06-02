# 修复预览切换 + 积分系统四个问题

## 1. 预览弹窗加上"上一张/下一张"切换（AssetPreviewDialog.tsx）

当前左右箭头只在同一资产的多个版本之间切换。改为：
- 优先在"同组兄弟资产"之间切换（同 stage、同 kind，按 store 中顺序），例如分镜 K01 ←→ K02、服装 W01 ←→ W02。
- 在 store 里新增 selector：`siblingAssetIds(currentId)` 返回同 stage+kind 的 id 列表。
- Dialog 内：左右箭头 → 调用 `useSC.getState().openPreview(siblings[i±1])`；顶部 chip 显示 `N/Total`。
- 多版本通过新增一个独立的小版本切换器（右上角 `v1/v2` 按钮组）保留，不再与方向键混用。
- 键盘 ←/→ 同步绑定切换上下张资产；Esc 关闭保持不变。

## 2. 头像圆环改为"消耗进度"（CreditRing.tsx）

当前 `pct = remaining/total`，环随消耗而缩短（剩余比例）。
改为 `pct = used/total`，环随消耗而填满（消耗进度），并按消耗比例切换颜色：
- ≥80% → 红色 `--credit-critical` + 脉冲
- ≥50% → 琥珀 `--credit-low`
- 其他 → `--accent`

## 3. 充值真正按面额到账并入库（核心 Bug）

**根因**：`PricingDialog.handleContinue` 只调用本地 `topUp(tier.credits)`，没有写入后端 ledger；下一次 `consume` 后会触发 `syncFromBackend`，后端只统计 `consume/refund`，本地 topup 立刻被覆盖回原始余额，于是充 100 / 充 3000 看起来效果相同。

修复：
- 新增服务端函数 `topUpCredits({ amount, tier })`（`src/lib/credits.functions.ts`）：向 `credit_ledger` 插入一行 `kind='topup', cost=amount, label='Top-up · {tier}'`，然后按现有累计逻辑（`total = CONSUME_TOTAL + topup`）返回最新余额。
- `credits-store.ts` 的 `topUp(n)`：
  1. 立刻乐观更新 `total += n`；
  2. `await topUpCredits({ amount: n, tier })`；
  3. 用返回值覆盖 `used/total`、写 localStorage。
- `PricingDialog.handleContinue` 改为 `await topUp(tier.credits, tier.id)`，按钮在请求中显示 loading，成功后再关闭。

## 4. 每次消耗弹出一次提醒（sonner toast）

`credits-store.ts > consume()` 内，乐观更新后立即触发：
```
toast(`本次消耗 ${cost} 积分 · ${label}（剩余 ${remaining}）`)
```
- 使用 `sonner` 的 `toast`，duration 2500ms。
- 同一 stage 在 300ms 内合并（用一个简单的去抖 map），避免分镜批量生成时刷屏。

## 5. 积分不足提示重新可见

**问题**：`LowCreditToast` 只挂载在 `Workspace.tsx`（用户在首页或登录页时不显示），并且 `openLow` 只在 `life` 阶段（store 1065/1424）手动触发，其他阶段消耗到 0 时不会自动弹出。

修复：
- 把 `<LowCreditToast />` 与 `<PricingDialog />` 从 Workspace 上提到 `src/routes/__root.tsx`，全局挂载一次。
- 在 `credits-store.consume()` 内：本地或后端返回的 `remaining` 命中阈值时自动 `openLow(taskId)`：
  - `remaining === 0` → 强制打开（无视 `lowDismissedFor`）；
  - `remaining/total ≤ 0.1` 且未对该 taskId dismiss 过 → 打开。
- 同时在 store 中所有 `if (!canAfford(...))` 分支（life 之外的 wardrobe/paint/scene 等）都补一次 `openLow(taskId)`，确保任意阶段不足都引导充值。

## 涉及文件
- 修改：`src/components/sc/AssetPreviewDialog.tsx`、`src/components/sc/credits/CreditRing.tsx`、`src/components/sc/credits/PricingDialog.tsx`、`src/lib/sc/credits-store.ts`、`src/lib/credits.functions.ts`、`src/lib/sc/store.ts`、`src/routes/__root.tsx`、`src/components/sc/Workspace.tsx`（移除已上提的组件）
- 不动：数据库 schema（`credit_ledger` 已支持 `kind='topup'`）、RLS 策略。

## 技术细节
- 兄弟资产 selector 写在 `store.ts`：`getSiblingAssetIds(id) = assets.filter(a => a.stage===cur.stage && a.kind===cur.kind).map(a=>a.id)`，按当前数组顺序。
- topup 不修改 `CONSUME_TOTAL` 基数，仅累加 ledger 中 topup 行，保持 `getCreditsBalance` 已有公式不变。
- toast 去抖用模块级 `Map<stage, timeoutId>`，合并文案为"本次消耗 X 积分"，避免 React 状态。