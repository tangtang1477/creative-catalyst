## 本轮目标

把验证通过的「生图 → 存桶 → 提视频 → 轮询拿 oss_url」链路接进现有 ShortCut 流程，替代 `paint` 和 `life` 阶段的 `SAMPLE_KEYFRAME` / `SAMPLE_VIDEO` 假数据。同时修掉测试中暴露的轮询重复插 asset 的 bug。

---

## 1. 修 bug：轮询重复插 asset（必须先做）

**现象**：`/test` 日志里出现 4 条 `status: success`，每条 `assetId` 不同。
**原因**：
- `pollVideoTask` 里判断 `if (normalized === "success" && ossUrl && !job.oss_url)` → 第一次 tick 异步 `insert assets`，但同时下一次 setInterval tick 已经并发跑起来，读到的 `job.oss_url` 仍是空，于是又插一条。
- 前端 `startPolling` 只在 tick **回调内**判断 success 才 clearInterval，第二次 tick 已经在路上。

**修法**（两端各加一道闸）：
- **后端 `seedance.functions.ts`**：把"标记完成 + 写 asset"包成原子操作——先 `update seedance_jobs set status='success', oss_url=... where task_id=? and oss_url is null returning *`，只有受影响行数 = 1 才真正 `insert assets`。其余并发 tick 拿不到行就直接返回已有 `asset_id`。
- **前端 `test.tsx` + 新接入处**：`submitFn` 返回后用 TanStack Query 的 `useQuery` + `refetchInterval` 改写轮询，`refetchInterval` 在 `status === 'success' | 'failed'` 时返回 `false`，天然停轮询。（顺便干掉 `setInterval` 那套手写逻辑。）

---

## 2. ShortCut `paint` 阶段接真实生图

文件：`src/lib/sc/store.ts` 的 `runPaint()`（行 455–536）

**改动**：
- 删掉 `schedule(..., FRAME_MS)` 那套定时器假流程。
- 对每个 `SHOTS[i]`：
  1. `updateAsset(r.shot, { status: "Generating" })`
  2. 调 `streamGenerateImage({ prompt: 拼接 brief + r.motion, onPartial: dataUrl => updateAsset(r.shot, { url: dataUrl }) })` —— partial 帧实时铺到卡片上（带 blur 由卡片自己根据 status 控制）
  3. 拿到最终 b64 → `uploadBase64Image({ base64, userId, taskId })` → 返回 public URL
  4. `updateAsset(r.shot, { status: "Ready", url: publicUrl })`，`consume("paint", ...)`
- 并发策略：**串行**（一个跟一个），避免 SSE 同时打爆。后续可加 `Promise.all` 分批。
- 失败处理：catch → `updateAsset(status: "Failed")` + `appendSummary("paint", "X 生成失败：...")`，继续下一个。
- 全部 `Ready` 后保持原 `runQC` 流程不变。

**需要**：store 拿当前 `userId` —— 在 `submit()` 入口处 `supabase.auth.getUser()` 一次缓存到 state（`currentUserId`），没登录直接报错跳 `/login`。

---

## 3. ShortCut `life` 阶段接真实视频

文件：`src/lib/sc/store.ts` 的 `runLife()`（行 589–641）

**改动**：
- 取 `paint` 阶段第一个 keyframe 的真实 URL 作为 `image_url`（不再硬编码 V01）。先做单视频，多镜后续。
- `updateAsset("V01", { status: "Processing" })`
- 调 `submitVideoTask({ route: 'first-frame-to-video', videoTaskId: taskId, payload: { prompt, image_url: firstKeyframeUrl, ratio: '16:9' } })` 拿 `taskId`
- 启动轮询（**用 §1 修过的方式**，3s 间隔，5min 超时）：
  - `processing` → `updateAsset("V01", { status: "Processing" })`
  - `success` → `updateAsset("V01", { status: "Ready", url: ossUrl, poster: firstKeyframeUrl })`，`consume("life", ..., 30)`，继续 `runDetails`
  - `failed` / `timeout` → `updateAsset("V01", { status: "Failed" })`，`set({ phase: "failed" })`
- 删掉 `schedule(..., 7000)` 那套假定时器。

**注**：轮询用纯 JS（`setInterval` + 闭包），不是 React 组件里的 `useQuery`，因为这是在 store action 里跑。但要严格做 dedupe：tick 只在拿到 `success/failed/timeout` 时 `clearInterval`，回调里二次判断 `assets.find(V01).status` 防止重复 update。

---

## 4. 其他保持不动

- `wardrobe` / `qc` / `scene` / `structure` / `details` 阶段：本轮先继续用假流程（这些不依赖外部 API，验证 paint+life 接通即可）。
- `seedance_jobs` 表 RLS：保持 SELECT-only，写入走 `supabaseAdmin`。
- 不动 UI 组件（AssetCard、MediaRail 等），它们已经按 `status` + `url` 渲染，真实 URL 直接生效。

---

## 5. 验收（用户在 `/` 跑一次完整任务）

1. 登录 → 主页输入 prompt → 进 intake → 确认 brief
2. 看 `paint` 阶段：每个关键帧从 blur partial → 清晰真图（来自 Storage public URL）
3. 看 `life` 阶段：V01 从 Processing → Ready，播放器能播 oss_url 视频
4. 刷新页面 → `taskHistory` 里能看到这条任务和真实资产

---

## 文件改动清单

- `src/lib/seedance.functions.ts` —— `pollVideoTask` 改为条件 update + dedupe insert
- `src/lib/sc/store.ts` —— `runPaint` / `runLife` 接真接口；`submit` 缓存 `currentUserId`；SCState 加 `currentUserId` 字段
- `src/routes/test.tsx` —— 轮询改 useQuery（顺手，证明同一套机制）

不动：UI 组件、其它 stage、auth/login 页。
