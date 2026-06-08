## 改动计划

### 1. 撤掉 Sidebar 上的"失败原因"红字
- 修改 `src/components/sc/Sidebar.tsx`：移除上一轮新增的 `isFailed && t.failureReason` 那段 `<p>失败原因：…</p>`，恢复成只有任务标题的一行布局。
- 保留 `store.ts` 里 `pickTopFailReason()` 与 `failureReason` 字段（项目详情页可能用得到，不主动删），但 Sidebar 不再渲染。
- 不动其它任何文案/样式。

### 2. 确认视频生成走的是真实 WAN，不是假视频

排查结论（已读过代码）：
- `src/lib/sc/store.ts` 的 `runLife()` (L1851+) 和 `runLifeSegment()` (L2306+) 都调用 `@/lib/wan.functions` 的 `submitVideoTask` + `pollVideoTask`，最终命中 `vb.movieflow.ai/video-base/generate-video*` 真实接口。
- `SAMPLE_VIDEO`（Google 公共 mp4）只出现在两类入口：
  - `forceState()` 调试入口（`case "ready" / "video-processing" / "series-demo" / "failed"`），生产 UI 没有调用点；
  - `?state=series-demo` 这种 demo URL。
- 正常任务流程不会塞 `SAMPLE_VIDEO`。

用户截图里 V01/V02/V03 出现"手表"成片，看起来像样片。为了排除"真接口被绕过"的疑虑，我会：
- 在 `runLife()` 提交段落处加一行 `console.info("[life] submit WAN", { route, taskId: submitRes.taskId, project_id })`，让浏览器控制台能直观看到每一段都打到 WAN。
- 在沙箱里直接用 curl 复跑一次 `POST /video-base/generate-video`，确认上游接口当前 200 + 返回 `gen_type=wan` 的 operation name（之前测过一次仍 OK，会再跑一次贴结果）。
- 不引入任何"自动 fallback 到 SAMPLE_VIDEO"的逻辑——如果接口失败就让任务真实失败。

如果用户那张图确实是假视频，最可能原因是该任务是早期通过 `forceState`/`?state=` demo 路径生成的旧记录；新任务一律走 WAN。需要的话我可以另开任务清理历史 demo 资产，但本轮不动数据。

### 不动的部分
- `store.ts` 的轮询重试 / 降级逻辑、`failureReason` 计算、`wan.functions.ts`、`projects.$projectId.tsx` 上的失败原因展示，全部保持原样。
- 不改动用户没点名的任何其它模块/样式。

### 验证
- 重新加载首页，确认 Sidebar 任务行不再出现红色"失败原因：…"文字。
- 新建一个真实任务，跑到 life 阶段，浏览器 console 应出现 `[life] submit WAN { taskId: "…" }`；同时贴出 curl 真实接口的 200 响应。
