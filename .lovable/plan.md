## 修复目标

针对截图反馈的两个问题做最小改动：

### 1. 失败卡红框宽度 + Play 图标错位

**问题定位**（`src/components/sc/AssetCard.tsx`）：
- 失败容器（line 132-138）缺少 `w-full`，且外层 `<div className="relative">` 没显式宽度，在某些布局下红色框未撑满父容器。
- line 168-172 的「Play 图标 overlay」条件是 `kind === "video" && !asset.url && !isLoadingState`，**失败状态也会命中**，所以红框中间额外叠了一个 ▶ 按钮，与「生成失败」文字重叠错位。

**改法**：
- 给失败容器加 `w-full`，外层 `<div className="relative">` 也补 `w-full`，确保 16/9 宽度铺满。
- 给 Play overlay 增加排除条件：失败态（无 url 且非 loading）不再渲染 Play 图标。

### 2. 重做视频出现假图（没真正重做 Seedance）

**问题定位**（`src/lib/sc/store.ts` `runLife`，line 959-984）：
- `runLife` 取「paint 阶段第一个 http(s) URL」作为首帧。`SAMPLE_KEYFRAME` 是本地静态资源（非 http URL），所以当 paint 用的是 sample 时该判断为空，直接走 fallback：3 秒后塞入 `SAMPLE_VIDEO`（截图里那段 Chanel 香水视频），并标记 V01 Ready。
- 这就是用户看到的「重做后出来一段假视频，根本没调 Seedance」。

**改法**（只动 `runLife` 的 fallback 分支，不动其它阶段）：
- 把 keyframe 判定放宽：接受任何非空 `url`（包含 `data:` 和静态资源），只要登录态有 userId 即提交 Seedance。
- 当真的无法发起真实生成（无 userId 或确实没任何 keyframe），不再静默塞 `SAMPLE_VIDEO`+Ready，而是把 V01 标为 `Failed`，写 `errorMessage`（如「未登录，无法生成真实视频」/「缺少关键帧，请先重跑 Keyframes 阶段」），并 `phase: "failed"`、**不扣积分**。这样重试入口和失败 UI 行为统一，不再出现假图。
- 保留 `clampSeedanceDuration` 逻辑（5s/10s 自动调整），避免再次踩 `InvalidParameter`。

### 改动文件

- `src/components/sc/AssetCard.tsx`：失败容器加 `w-full`，外层 wrapper 加 `w-full`，Play overlay 排除失败态。
- `src/lib/sc/store.ts` · `runLife`：放宽 keyframe URL 判定；无真实生成路径时直接 Failed（不扣分、不塞 sample）。

### 验收

1. 失败卡红框与外层卡片等宽，中央不再出现错位的 ▶ 图标。
2. 在没有真实 keyframe / 未登录场景下重做视频不会再出现 Chanel 假视频，而是显示明确的失败原因和「重试」按钮，不扣积分。
3. 有真实 keyframe 时重做会真正再调一次 Seedance（duration 已 clamp 到 5/10s）。