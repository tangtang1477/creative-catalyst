## 目标
把视频生成上游从 Seedance 换成 WAN（`vb.movieflow.ai`），保留现有 pause/resume、降级、轮询、积分、计费、Failed/Ready UI 等逻辑不变。

## 上游接口对应

| 当前 Seedance route | 新 WAN 接口 | WAN 上游模型 |
|---|---|---|
| `text-to-video` | `POST /video-base/generate-video` | wan2.6-t2v |
| `first-frame-to-video` | `POST /video-base/generate-video-by-image` | wan2.6-i2v |
| `reference-image-to-video` | `POST /video-base/generate-video-by-image-use-reference-images` | wan2.6-r2v |
| `task-status` | `POST /video-base/check-video-status` | — |

所有接口固定 `guid: "WAN"`、`Content-Type: application/json`，无 Bearer 鉴权（按文档示例无 Authorization）。

## 关键差异（必须处理）

1. **任务标识不再是单一 `task_id`**：创建接口返回 `operations` 数组；查询接口必须把上一次返回的 `operations` 原样回传。 → server fn 之间传递整个 `operations` 对象，而不是 string id。
2. **`aspect_ratio` 枚举变化**：当前 store 传 `ratio: "16:9"/"9:16"`；WAN 用 `VIDEO_ASPECT_RATIO_LANDSCAPE / PORTRAIT`。在 server fn 内做映射（`16:9`→LANDSCAPE，`9:16`→PORTRAIT，其它默认 LANDSCAPE）。
3. **`duration` 固定**：WAN t2v=8s、i2v 默认 10s、r2v 默认 10s（按文档当前上游参数），不再支持任意秒数。前端的 `clampSeedanceDuration` 与按 5/10s 颗粒拼接的提示已经不准确——保留拼接逻辑（按 8s/10s 切段）但 server fn 内不再下发 duration（由后端默认）。视频文案里把"Seedance 5s/10s"改成"WAN 8s/10s"。
4. **新增必填字段**：`project_id`、`video_name`。
   - `project_id`：用现有 `taskId`（视频任务 UUID）或当前项目 id；为简单起见传 `videoTaskId ?? "adhoc"`。
   - `video_name`：用 `${videoTaskId}_${assetId}`，限制长度。
5. **完成态字段**：成功用 `result.operations[0].qiniuVideoUrl`（替换原 `oss_url`）；失败由 `all_error: true` + `error_message` 判定。
6. **错误码归类**：WAN 失败 `error_message` 是 JSON 字符串，沿用 `classifySeedanceError` 的关键词匹配即可（real person / policy / quota），改名为 `classifyWanError`。

## 改动文件

### 1) `src/lib/wan.functions.ts`（新建，取代 seedance.functions.ts 的对外契约）
- `submitVideoTask({ route, videoTaskId, payload })`
  - `route`: `"text-to-video" | "first-frame-to-video" | "reference-image-to-video"`（保留旧名，内部映射到 WAN 路径）
  - `payload`: `{ prompt, image_url?, image_urls?, ratio?, aspect_ratio? }` —— 不再要求 duration。
  - 内部根据 `route` 调用对应 WAN URL，固定注入 `guid: "WAN"`、`num_videos: 1`、`video_name`、`project_id`、`aspect_ratio`。
  - 返回 `{ operations, sceneId }`（不再是单一 taskId）。
  - 写入 `wan_jobs` 表（见迁移）：把 `operations[0].operation.name` 作为 `task_id` 主键，整个 `operations` 存到 `operations` jsonb。
- `pollVideoTask({ operations, aspectRatio?, videoName?, videoTaskId? })`
  - 入参带上 `operations`（原样从 submit 拿到，由 store 缓存到 asset.meta），POST 给 `/video-base/check-video-status`。
  - 返回 `{ status: "processing"|"success"|"failed", ossUrl, operations: nextOps, errorCode?, errorMessage? }`。
  - 成功时把 `qiniuVideoUrl` 写入 assets 表 + 更新 `wan_jobs.oss_url` + 更新 `video_tasks.status`，逻辑与现 seedance 路径一致。
  - 失败时分类填 `errorCode/errorMessage`。
- 复用 `classifyWanError`，前缀格式仍为 `[code] message :: <upstream raw>`，让 store 端的正则继续工作。

### 2) `src/lib/sc/store.ts`
- import 改成 `@/lib/wan.functions`。
- 在 asset 上记录 WAN 返回的 `operations`（放到 `asset.meta?.wanOps` 或本地闭包变量，按当前实现简单的话用闭包变量）。
- 把所有 `pollVideoTask({ data: { taskId } })` 改为 `pollVideoTask({ data: { operations, aspectRatio, videoName, videoTaskId } })`，operations 从 submit 返回值里取。
- 文案：`"Seedance"` 字样统一替换为 `"WAN"`（影响 `appendSummary`、错误兜底文案、`consume(... seedance)`、错误码 `seedance_failed`→`wan_failed`）。
- 移除/忽略 `payload.duration`：调用 submit 时不再下发 duration（保留 store 内的 5/10s 段拼接逻辑用于 UI 展示与查询合并，但提示文案改为"按 WAN 8s/10s 颗粒拼接"）。
- `format-utils.ts` 的 `clampSeedanceDuration` 暂不删除（避免破坏 import），但 store 内不再调用——或同步删掉（更干净）。建议保留并加注释 deprecated。

### 3) `src/lib/tasks.functions.ts`
- `source: a.source ?? "seedance"` 改为 `"wan"`。

### 4) 数据库迁移：新表 `wan_jobs`（不要原地改 `seedance_jobs`，保留历史数据）
```text
create table public.wan_jobs (
  task_id text primary key,                 -- operations[0].operation.name
  user_id uuid not null references auth.users(id) on delete cascade,
  video_task_id uuid references video_tasks(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  route text not null,                      -- t2v|i2v|r2v
  status text not null default 'pending',
  progress integer not null default 0,
  operations jsonb,                         -- WAN operations 原样
  oss_url text,                             -- qiniuVideoUrl
  request_payload jsonb,
  raw jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.wan_jobs to authenticated;
grant all on public.wan_jobs to service_role;
alter table public.wan_jobs enable row level security;
create policy "Users select own wan jobs" on public.wan_jobs
  for select to authenticated using (auth.uid() = user_id);
create trigger trg_wan_jobs_touch before update on public.wan_jobs
  for each row execute function touch_updated_at();
```

### 5) Secrets / env
- 文档示例无鉴权头。如果 `SEEDANCE_API_KEY` 仍想保留作为可选 Bearer，则代码里 `WAN_API_KEY ?? SEEDANCE_API_KEY`。先按"无鉴权"实现，跑通后再加。
- 新增可选 env：`WAN_HOST`（默认 `http://vb.movieflow.ai`），`WAN_DEFAULT_DURATION`、`WAN_DEFAULT_RESOLUTION`、`WAN_R2V_DURATION`、`WAN_R2V_SIZE`、`WAN_R2V_SHOT_TYPE` —— 当前实现里**不下发**这些字段（让上游用默认），无需 secrets。

### 6) `src/routes/test.tsx`
- 把 polling 从 `{ taskId }` 改成 `{ operations }`；新增提交后保存 `operations`。

### 7) `src/lib/seedance.functions.ts`
- 暂时保留文件以兼容历史导入（如果还有），但内部 re-export `wan.functions` 的同名导出。或直接删除（推荐）——`tasks.functions.ts` 不依赖它，store 改完后无引用。

## 不动的部分（明确）
- pause/resume 链路、积分扣费、UI 文案（除"Seedance"字样替换）、StageRow/AssetCard、IntakeCard、ApprovalChips、路由树结构、project 详情页、Sidebar、其它 stage（wardrobe/cast/paint/script/qc）。
- 5/10s（改 8/10s 文案）段拼接 UI 逻辑保持。

## 验收清单
1. T2V：无参考图时，提交成功，轮询到 `qiniuVideoUrl`，asset 切 Ready。
2. I2V（首帧+无 wardrobe）：first-frame-to-video 走 WAN i2v 成功。
3. R2V（带 wardrobe refs + 首帧）：reference-image-to-video 走 WAN r2v 成功，最多 3 张 ref（按文档非 seedance 分支限制）。
4. 真人/违规：降级走 text-to-video，路径正确。
5. 暂停/恢复：在创建/轮询/Sleep 三处均能立即停止 & 恢复。
6. 失败/超时：5min 超时 + WAN 失败均回到 Failed，未扣积分。
7. Asset 元数据 source 为 `wan`，DB `wan_jobs` 行存在且 `oss_url` 已回填。
8. `/test` 页面 E2E 通过（提交 + 轮询 + 视频播放）。
