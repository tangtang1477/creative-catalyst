# 后端接入计划

## 整体架构

```text
Client (React)
  │
  ├─ POST /api/generate-image        ─→ Lovable AI Gateway (openai/gpt-image-2, SSE)
  │                                     ↓ partial frames 实时返回
  │                                     最终图上传 Storage → 拿到 https URL
  │
  ├─ POST /api/video/submit          ─→ vb.movieflow.ai/seedance2/<route>
  │                                     拿 task_id 存 DB
  │
  └─ GET  /api/video/poll?task_id=… ─→ vb.movieflow.ai/seedance2/task-status
                                       返回 status/progress/oss_url
```

所有外部 API 调用都在 TanStack 服务端路由里完成，密钥放 secrets。

## 第一步：启用 Lovable Cloud + 关键 secrets

- 启用 Lovable Cloud（自动 provision `LOVABLE_API_KEY`、Storage、Postgres、Auth）
- 新增 secret：
  - `SEEDANCE_HOST` = `https://vb.movieflow.ai`（写死也行，但放 secret 方便切环境）
  - `SEEDANCE_API_KEY`（**待确认**：文档没写鉴权方式，需要你确认是 Bearer token 还是其它，或者根本不需要）

## 第二步：数据库表

```sql
-- 任务表：用来持久化 task 状态、关联生成的素材
create table public.video_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  prompt text not null,
  status text not null default 'pending',           -- pending|processing|success|failed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.video_tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,                               -- image|video
  url text not null,                                -- Storage 公开 URL
  source text not null,                             -- gpt-image-2|seedance|upload
  meta jsonb,                                       -- {duration, ratio, seed_task_id ...}
  created_at timestamptz default now()
);

create table public.seedance_jobs (
  task_id text primary key,                         -- Seedance 返回的 cgt-xxx
  asset_id uuid references public.assets(id) on delete set null,
  video_task_id uuid references public.video_tasks(id) on delete cascade,
  status text not null default 'pending',
  progress int default 0,
  oss_url text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

每张表配 `GRANT` + RLS（`auth.uid() = user_id`）。

## 第三步：Storage bucket

```sql
insert into storage.buckets (id, name, public) values ('media', 'media', true);
```

公开桶，OpenAI 生成的图、用户上传的图都存这里。Seedance 接口需要 `image_url` 是可公网访问的 https，所以必须 public。

## 第四步：服务端路由

### 4.1 图片生成 `src/routes/api/generate-image.ts`

- 用 TanStack server route（**不能用 createServerFn**，SSE 流不能跨 RPC 序列化）
- 调 `https://ai.gateway.lovable.dev/v1/images/generations`：
  ```json
  {
    "model": "openai/gpt-image-2",
    "prompt": "...",
    "quality": "low",
    "size": "1024x1024",
    "stream": true,
    "partial_images": 2
  }
  ```
- `upstream.body` 直通客户端（保留 SSE 流式渐进预览）
- 客户端用 `eventsource-parser` + `flushSync` 解析（partial 加 blur，completed 去 blur）
- 拿到最终 PNG 后：base64 → 上传 Storage → 写入 `assets` 表 → 拿到 https URL

### 4.2 视频提交 `src/routes/api/video/submit.ts`

- `createServerFn` + `requireSupabaseAuth`
- 入参（Zod 校验）：
  ```ts
  {
    videoTaskId: uuid,
    route: 'text-to-video' | 'first-frame-to-video' | 'first-last-frame-to-video'
         | 'reference-image-to-video' | 'reference-video' | 'extend-video' | 'create-task',
    payload: { prompt, image_url?, first_image_url?, ... }  // 按路由形状校验
  }
  ```
- 自动注入 `model: 'sd2.0-fast'`（除非用户明确要 1080p）
- POST 到 `${SEEDANCE_HOST}/seedance2/<route>`，带 `SEEDANCE_API_KEY`
- 拿到 `data.task_id` → 写 `seedance_jobs` 表 → 返回 task_id
- 隐私风控处理：如果返回 `InputImageSensitiveContentDetected.PrivacyInformation`，自动走 batch-upload-asset → create-task 的兜底路径

### 4.3 视频轮询 `src/routes/api/video/poll.ts`

- `createServerFn`，入参 `{ task_id }`
- POST 到 `${SEEDANCE_HOST}/seedance2/task-status`，带 `video_name` + `aspect_ratio`
- 收到 `oss_url` 后：
  - 写入 `assets`（kind=video, url=oss_url）
  - 更新 `seedance_jobs.status='success'`
  - 更新对应 `video_tasks.status`
- 前端用 TanStack Query `refetchInterval: 3000`，状态变 success/failed 时停轮询

## 第五步：前端接入点

只改 `src/lib/sc/store.ts` 的 stage 推进逻辑，UI 不动：

| Stage | 现状（mock） | 接入后 |
|---|---|---|
| `scene`/`structure`/`wardrobe` | 假 thoughts + sample 图 | 调 Lovable AI `gemini-3-flash-preview` 生成分镜文字 |
| `paint` | sample 关键帧 | 调 `/api/generate-image`，流式显示 partial，最终落 Storage |
| `qc` | mock | Gemini 多模态校验关键帧一致性 |
| `life` | sample 视频 | 调 `/api/video/submit`（first-frame-to-video）+ 轮询 `/api/video/poll` |
| `details` | mock | 收尾、汇总素材 |

`Asset.url` 全部替换成真实 Storage / oss_url，gallery 直接渲染。

任务列表（sidebar）从 `video_tasks` 表读，刷新后状态还在。

## 第六步：登录（最简方案）

默认开邮箱密码 + Google 登录。任务/素材按 `auth.uid()` 隔离。

---

## 技术备注

- **图片 → 视频 的 URL 桥接**：OpenAI 返回 base64，必须先上传到 Storage 拿到 https URL 才能传给 Seedance（接口只收 URL，不收 base64）
- **轮询策略**：前端 3s 一次，超时 5 分钟；服务端不长连，节省 Worker 时间
- **错误透传**：429/402（AI Gateway）、`code != 0`（Seedance）→ 走 toast
- **不引入新依赖**（`eventsource-parser` 已有的话直接用，否则 `bun add eventsource-parser`）
- **mock 兼容**：保留一个 `VITE_USE_MOCK=true` 的本地开关，方便没 key 时离线 demo

## 需要你确认的 3 件事（影响实现细节）

1. **Seedance 鉴权方式**：文档里没写。是 `Authorization: Bearer <key>`、`X-API-Key`、还是放在 query/body？key 是什么名字？
2. **图片 stage 是否每个分镜都用 gpt-image-2 生**？还是只有 `paint`/关键帧用，前面 `scene`/`structure` 仍然纯文本？
3. **音频**：Seedance 默认 `generate_audio: true`。要默认开还是默认关？（开了会更慢）

回答完我就进 build 模式开干。
