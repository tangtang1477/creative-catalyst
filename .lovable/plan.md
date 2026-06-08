## 目标

让 WAN 视频段在轮询期间遇到网络/接口异常时自动指数退避重试，超出上限后归类为可识别的失败码并展示在 asset 卡片与 sidebar/项目页的 task 卡片上。

## 现状

- `src/lib/sc/store.ts` 中两处轮询循环（`runLife` ~L2007、`retryLifeSegment` ~L2347）对 `pollVideoTask` 抛出的错误只做 `console.error + continue`，没有上限、没有任何用户可见信号，要硬等 5 分钟超时。
- 后端返回 `status:"failed"` 时直接终止，但当上游是 5xx/超时这种瞬态故障时也会被等同处理。
- asset 上有 `errorMessage / errorCode`，task 级 `failureReason` 已在 `persistCurrent` 时从最后一条 stage summary 取；项目页 `projects.$projectId.tsx` L341 已显示，sidebar 没有。

## 改动

### 1. `src/lib/sc/store.ts` — 轮询加入重试/退避

抽出一个本地工具：

```ts
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRANSIENT = 5;          // 连续异常上限
const POLL_BACKOFFS = [3000, 5000, 8000, 13000, 20000];
const POLL_TIMEOUT_MS = 5 * 60_000;
```

在两个循环里替换 `try/catch{ continue }` 为：

- 维护 `transientFails` 计数与最近一条 `lastTransientMsg`。
- `pollVideoTask` 抛错时：`transientFails++`，按 `POLL_BACKOFFS[min(idx, last)]` 等待；同时 `updateAsset(id, { status: "Recovering", errorMessage: "网络异常，自动重试 N/M …", errorCode: "poll_transient" })` 给出可见降级提示。
- 成功一次轮询则把计数清零，并清除 `errorCode === "poll_transient"` 的临时错误信息。
- `transientFails > POLL_MAX_TRANSIENT` → 返回 `{ ok:false, code:"poll_failed", message:"WAN 轮询连续异常，已停止重试" }`。
- 整体仍受 `POLL_TIMEOUT_MS` 兜底。

后端返回 `status:"failed"` 的分支保持不变（已分类好 `errorCode/errorMessage`）。

### 2. 失败原因写入 task 卡片

`runLife` 末尾已经 `updateStage("life", { status:"failed", errorMessage: msg })`，`persistCurrent("failed")` 会把 `msg` 抓为 `failureReason`。在新增的 `poll_failed` / `timeout` 分支里，确保失败汇总文本带上失败原因，例如：

- 全部失败：`"全部视频段渲染失败：<最多见的 errorMessage>"`（按 `errorCode` 分桶取 mode）。
- 部分失败：保持当前提示，但追加 `"，常见原因：<msg>"`。

这样 sidebar/项目页读到 `failureReason` 就有真原因，而不只是“全部视频段渲染失败”。

### 3. Sidebar 任务卡片显示 failureReason

`src/components/sc/Sidebar.tsx`：在 task list item 中，对 `t.status === "failed" && t.failureReason` 追加一行 `text-xs text-destructive truncate` 提示，与项目页 L341 视觉一致（同一段文案，不改交互）。

### 4. 不动的部分

- `src/lib/wan.functions.ts` 后端逻辑、`classifyWanError` 分类、`submitVideoTask` 行为不变。
- `policy_real_person / policy_violation` 自动降级 `refs → text-only` 逻辑保留。
- 不引入新的 toast / dialog；只复用现有 `errorMessage` 字段与已有 UI。

## 验证

1. 临时把 `WAN_HOST` 指向不可达地址，触发 `pollVideoTask` 抛错：asset 卡片应出现“网络异常，自动重试 N/5 …”，5 次后整体失败，task 卡片显示 `失败原因：WAN 轮询连续异常…`，sidebar 同步展示。
2. 正常视频任务：重试计数应在成功一次轮询后清零，不留下残余 `errorMessage`。
3. 后端真返回 `status:"failed"` 时：仍按现有分类直接失败，不再多余等待。
