## 根因诊断

直接查了数据库，结果出乎意料：

- `projects` 表里你的项目都在（包括截图里的 `_ (4).jpeg 用这个形象做连续剧…`）。
- `video_tasks` 表 **总共 0 行**（`select count(*) → 0`）。
- `assets` 表却有 12 条已生成的视频，且 **全部 `task_id` 为 NULL**。

所以"点项目→暂无历史"不是匹配逻辑的 bug，而是 **任务从来没被持久化到数据库**。之前那轮"去掉 snapshot 非空过滤 / title 兜底 / 异步回填"全部是在拉空表，再怎么补匹配规则都拉不出东西。同理，资源生成走的是 seedance 直连流程，`task_id` 没回填，所以连"从 assets 反推 task"这条路也断了。

两条因果链：

1. **submit() 只在内存里建 task**：`taskId = newId()` 仅写到 store，没有立刻 `upsertTaskSnapshot`。`persistCurrent` 只在 stages 跑起来时才触发；如果用户停在 intake、或走的是 seedance 直生成路径（不经过 stages），数据库永远没记录。
2. **seedance 生成的 asset 没绑 task_id**：`seedance.functions.ts:275` 写的是 `task_id: job.video_task_id ?? null`，而 `seedance_jobs.video_task_id` 在前端提交时也基本是 null（submit 路径里没有把 store 的 `taskId` 透传给 seedance），所以 asset 全部裸挂在 user 名下。

## 修复计划

### 1. 任务一创建就落库（最关键）

`src/lib/sc/store.ts` 的 `submit()`：在 `set({ taskId: newTaskId, ... })` 之后、自动建项目之后，**立即** `await upsertTaskSnapshot(...)` 一次，写入最小骨架：
- `taskId: newTaskId`
- `projectId: currentProjectId`（series 流程下，等自动建项目完成后再发；oneoff 直接发 null）
- `title: inferTaskTitle(text)`
- `prompt: text`
- `status: "running"`
- `snapshot: { kind, createdAt, updatedAt, status, assets:[], stageSummaries:{}, stageSnapshots:{}, brief, script:null }`

这样无论用户后续走什么路径，DB 里都已经有这一行，下次 enterProject 一定能拉到。

### 2. seedance 资产回绑 task_id

`src/lib/sc/store.ts` 调 `submitVideoTask` 的两处（约 1446 / 1742 行）：把当前 store 的 `taskId` 透传到 `submitVideoTask({ data: { ..., videoTaskId: taskId } })`。

`src/lib/seedance.functions.ts`：`submitVideoTask` 的输入加可选 `videoTaskId`，写入 `seedance_jobs.video_task_id`。然后 `pollVideoTask` 在 `assets.insert` 处用这个值。

效果：以后生成的视频会绑定到当前 task，可以反向支撑"从 assets 反推 task"的兜底路径。

### 3. enterProject 兜底再加一层：title 模糊匹配

当前 `enterProject` 只匹配 `title === proj.name`。但 `inferTaskTitle` 会截断到 ~40 字、去换行，而项目名是完整 prompt（带换行、带 `[偏好]`）。两者大概率不相等。

改成：`normalize(title) === normalize(proj.name)` 或 `proj.name.startsWith(title)` 或 `title.includes(first 20 chars of proj.name)`，任一命中即视为本项目任务。同样的规则也用在 `ActiveProjectBanner` 的过滤里。

`normalize` = `.replace(/\s+/g," ").trim().slice(0, 60)`。

### 4. 老项目历史回填（一次性 backfill）

对当前用户已存在的 `assets` 且 `task_id IS NULL`、`projects` 表里有项目名能和 asset 的 `meta.prompt`（如果有的话）/ 创建时间窗口对上的，新建一个 `video_tasks` 行 + 把 asset 的 `task_id` 更新过去。这一步用新增的服务函数 `backfillLegacyTasksForProject({ projectId })`，在 `enterProject` 拉到 0 条远程任务时自动调用一次。

匹配启发式：
- 该用户名下 `assets.created_at` 落在项目 `[created_at, updated_at + 7d]` 区间内、且没有 task_id 的，
- 按"同一天内连续生成的视频"分组，每组合成一个 task 行，`title = project.name`，`projectId = project.id`，`snapshot.assets` 用 `{ id, url, kind: "video", source: "seedance" }` 重建。

跑完后老项目就能看到"这些历史视频"，而不是一片空白。

### 5. 调试可见性

`enterProject` 末尾打一条 `console.info("[enterProject] hits", { projectId, projName, remoteCount, localCount, matchedCount })`。下次用户截图，我们直接能从浏览器控制台看到哪一步断了，不用再猜。

## 涉及文件

- `src/lib/sc/store.ts`（submit 立刻落库；seedance 调用透传 taskId；enterProject 模糊匹配 + backfill 调用 + 日志；ActiveProjectBanner 过滤同步）
- `src/components/sc/Workspace.tsx`（ActiveProjectBanner 的过滤改成 normalize 匹配）
- `src/lib/seedance.functions.ts`（`submitVideoTask` 接 `videoTaskId`，写入 `seedance_jobs.video_task_id`）
- `src/lib/tasks.functions.ts`（新增 `backfillLegacyTasksForProject`）

不动 schema，不加表，不动 RLS。
