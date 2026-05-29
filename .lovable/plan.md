## 本轮目标

只做后端验证，不动 ShortCut 业务流。完成后下一轮再接入。

## 1. 开启认证（邮箱 + Google）

- 调 `supabase--configure_social_auth` 启用 `google`（邮箱默认开启，不动）
- 不开 auto-confirm（用户没要求）
- 不开匿名登录

## 2. 最小登录页 `/login`

只放两个按钮，足够拿到 session 给 `requireSupabaseAuth` 用：

- 邮箱注册 / 登录（`supabase.auth.signUp` / `signInWithPassword`，`emailRedirectTo: window.location.origin`）
- Google 登录（通过 `lovable.auth.signInWithOAuth("google", { redirect_uri })`）
- 根路由 `__root.tsx` 加 `onAuthStateChange` 监听 + `queryClient.invalidateQueries()`

## 3. 测试页 `/test`

一个页面跑完整链路，所有按钮带状态展示：

```text
[1] Prompt 输入框
[2] 生图按钮 → POST /api/generate-image (SSE)
    - 实时显示 partial base64 预览（blur，最终去 blur）
    - 完成后调 uploadBase64Image() → 拿到 Storage public URL
    - 显示 URL + <img> 预览
[3] 提交视频按钮（用上一步图 URL）
    - 调 submitVideoTask({ route: 'first-frame-to-video', payload: { prompt, first_image_url } })
    - 显示返回的 task_id
[4] 自动轮询（每 3s 调 pollVideoTask）
    - 显示 status / progress
    - status === 'success' 时显示 oss_url + <video> 预览
    - status === 'failed' 或 5 分钟超时停轮询
[5] 日志面板：每一步原始返回 JSON 折叠展示
```

文件：`src/routes/test.tsx`（独立路由，不影响首页）

## 4. 路由保护

`/test` 用最简方式：未登录就显示「请先登录」按钮跳 `/login`，登录后渲染测试 UI。不引入 `_authenticated` 布局（下一轮接 ShortCut 时再统一加）。

## 5. 修一个已知问题

`seedance_jobs` 表当前只有 SELECT 策略，缺 INSERT/UPDATE。服务端虽然用 `supabaseAdmin` 写入（绕过 RLS）能成功，但为了 `listVideoTasks` 等读取链路一致，保持 SELECT-only 即可，**不动**。

## 技术细节

- **SSE 客户端解析**：用 `eventsource-parser`（已在 lock 里？没有就 `bun add`），逐帧 `flushSync` 渲染 partial
- **base64 → Storage**：客户端拿到最终 `b64_json` 后 fetch `data:image/png;base64,...` → `Blob` → `supabase.storage.from('media').upload(...)` → `getPublicUrl()`。已有 `src/lib/upload-image.ts` 直接用
- **Seedance route 选择**：测试页固定用 `first-frame-to-video`，最贴合"图→视频"链路；payload 形状：`{ prompt, first_image_url, ratio: '16:9' }`
- **轮询**：TanStack Query `useQuery` + `refetchInterval: (q) => ['success','failed'].includes(q.state.data?.status) ? false : 3000`
- **错误处理**：429/402 toast 提示，Seedance `code != 0` 显示 `message`
- **不动 `store.ts`/UI 组件**，下一轮再接

## 需要你确认的 1 件事

**Seedance 鉴权方式**：当前代码默认 `Authorization: Bearer <SEEDANCE_API_KEY>`。如果文档说是 `X-API-Key` 或别的 header，跑通前先告诉我，否则第一次调用会 401。

---

确认后我切到 build 模式做 3 件事：启用 Google → 写 `/login` → 写 `/test`，跑通后告诉你 oss_url 是否拿到。
