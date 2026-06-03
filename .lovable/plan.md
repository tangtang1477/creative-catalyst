## 目标

1. **删除"任务额度（QUOTA=200）"概念**：积分体系只有"账户余额"一个口径。
2. **圆环逻辑重定义**：账户余额 ≥ 200 → 蓝色圆环 100% 闭合；账户余额 < 200 → 按 `余额 / 200` 比例显示蓝色弧。
3. **修复"充值不到账"**：现状下圆环和面板都被 QUOTA=200 封顶，充值后视觉上毫无变化，给用户造成"没到账"的错觉。移除封顶后，余额变化能直接体现在数字和圆环上。

## 调整范围

### 1. `src/lib/sc/credits-store.ts`
- 导出常量改名：`QUOTA` → `RING_FULL_AT = 200`（仅用于圆环视觉满格阈值，不再参与任何"已用/封顶"计算）。
- 删除 `quotaUsed` / `quotaRemaining` / `quotaPercent` / `remainingPercent` 等带 quota 字眼的 selector。
- 保留 / 新增：
  - `remaining(s) = max(0, s.total - s.used)` —— 唯一余额口径
  - `ringPercent(s) = min(1, remaining / RING_FULL_AT)` —— 圆环填充比例
- `consume` 内的低额度提示阈值改为基于真实剩余余额（如 `remaining === 0` 或 `remaining <= 20`），不再用 quota 比例。
- `notifyConsume` toast 文案改为 `本次消耗 X 积分 · 账户余额 Y 积分`。
- `topUp` 成功 toast 文案改为 `充值成功 · 到账 N 积分 · 账户余额 Y 积分`，去掉"任务额度"行。
- `load()` 仍以 200 作为新用户初始 `total`，但不再把 `total` 视为上限——后端同步回来的真实 total（如 3206）会正常覆盖且生效。

### 2. `src/components/sc/credits/CreditRing.tsx`
- 改为读取 `remaining` 与 `ringPercent`。
- `dash = c * ringPercent`，余额 ≥ 200 时圆环完整闭合。
- 颜色阈值改为基于真实余额：`remaining <= 20` critical、`remaining <= 50` low，其余 accent。
- `title` 文案：`账户余额 X 积分`，去掉"任务额度"。

### 3. `src/components/sc/credits/CreditsHoverPanel.tsx`
- 顶部行标题由"任务额度"改为"账户余额"，右侧显示 `{remaining} 积分 ›`（不再写 `/200`）。
- 删除独立的"账户余额"小行（已合并到顶部）。
- 20 个圆点条改为按 `ringPercent` 填充（余额 ≥ 200 时全亮）。
- 动画计数 `display` 跟踪 `remaining`。

### 4. `src/components/sc/UserHoverCard.tsx`
- 顶部细进度条改用 `ringPercent`（与圆环一致），余额 ≥ 200 时 100%。
- 阈值色同上（基于真实 remaining）。

### 5. `src/components/sc/credits/LowCreditToast.tsx`
- `pct` / 文案改成基于真实余额（如 `余额仅剩 X 积分`），删除 quota 相关字段。

## 不在范围内
- 不动后端 `credits.functions.ts`、`credit_ledger` 表（充值实际是到账的，问题只是 UI 被 200 封顶；后端继续按 `200 + topup` 计算 total）。
- 不动 `consume` 调用点（仍是每次 5 积分）。
- 不动项目侧逻辑（本轮只处理积分 UI 口径）。

## 验收
- 新用户：total=200, used=0 → 圆环 100%，面板显示 `200 积分`。
- 消耗 5 积分 → 圆环仍 100%（195/200 比例几乎满），面板 `195 积分`，toast `本次消耗 5 积分 · 账户余额 195 积分`。
- 余额降到 150 → 圆环显示 75% 弧。
- 余额降到 20 → 圆环 10% 弧 + critical 红色 + 自动弹低额度提示。
- 充值 +800 → 余额变 820，圆环立即回满 100%，面板显示 `820 积分`，toast `充值成功 · 到账 800 积分 · 账户余额 820 积分`。
