## 问题 1：音色试听没有声音

**根因**：`src/lib/sc/voices-store.ts` 的 `preview()` 里，`new Audio(url)` 创建在 `await fnPreview(...)` 之后。await 会打断用户手势上下文，导致 `audio.play()` 在 Safari / 较严格浏览器下被自动播放策略拦截（且 catch 里只 set error 不打日志，看起来"无声且无报错"）。

**修复**（仅改 `src/lib/sc/voices-store.ts`）：
1. 把 `new Audio()` 移到 `await` 之前同步创建，保持在用户手势内（参考 Lovable 知识库的 SpeechSynthesisUtterance 模式）。
2. await 拿到 base64 后，再把 `data:` URL 赋给 `audio.src`，然后 `audio.play()`。
3. catch 里加 `console.error`，并把错误冒泡到 store 的 `error` 字段，方便排查。
4. 保持现有 `stopPreview` / `previewingId` / `currentAudio` 逻辑不变。

## 问题 2：从「项目详情」点 task 进入工作区闪退

**根因**：`restoreTask` 会把 `rec.archivedChat` 里的消息直接塞进 `chatLog`，其中 `optionCards` / `toolCalls` / `skill` 字段是 `unknown` 透传，结构可能与当前组件期望不一致（例如旧字段缺失、`optionCards[i].options` 缺位）。Workspace 的两处渲染（顶部 pinned awaiting 卡片 + 主 timeline 的 ChatAgentMessage）目前**没有 ErrorBoundary**，任何一项渲染抛错就直接撞到路由 `errorComponent`，表现为"闪退"。`StageBoundary` 只包了各 stage，没保护 chatLog。

**修复**（最小改动，前端层）：
1. `src/lib/sc/store.ts` 的 `restoreTask`：在把 `archived` 消息推入 `chatLog` 之前，对每条 `optionCards` / `toolCalls` 做结构净化：
   - `optionCards`：只保留含 `id`、`status`、`options(array)` 的条目；缺字段就丢弃，不让组件解构出错。
   - `toolCalls`：只保留含 `id`、`label` 的条目。
   - `skill`：必须含 `id` 才保留。
2. `src/components/sc/Workspace.tsx`：用一个轻量 ErrorBoundary（复用 `StageBoundary` 的模式，新建 `ChatBoundary` 或直接复用 `StageBoundary` 不传 stageId）包住：
   - 顶部 pinned awaiting `ChatOptionCard` 列表
   - 主 timeline 的 `chatLog.map(...)` 渲染块
   每条消息单独包一层，单条出错只降级该条为"⚠️ 该消息无法回放"，而不是整页崩溃。
3. `src/routes/projects.$projectId.tsx` 的 `handleOpenTask` 已经有 `canRestoreTaskRecord` 校验和 try/catch；额外保证 `restoreTask` 抛错不会让 navigate 跳过去后崩溃 —— 现在主因是渲染层崩溃，所以核心修复在第 1、2 步。

## 范围

- 改动文件：`src/lib/sc/voices-store.ts`、`src/lib/sc/store.ts`（仅 `restoreTask` 内的 chatLog 净化段）、`src/components/sc/Workspace.tsx`（加 ErrorBoundary 包裹）。
- 不动：后端、其它组件、设计 token、Sidebar、Canvas、MediaRail、StageRow。
- 不动：用户未点名的任何其它逻辑。

## 验证

1. 打开音色库点试听 → 应能听到声音；多次点切换不卡死。
2. 进入「项目详情」点历史 task → 跳到 `/` 正确回放，不再白屏 / errorComponent；如某条历史消息结构异常，只显示一条降级提示。
