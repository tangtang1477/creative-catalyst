
## 问题定位

**问题 1：引导语 "请选择…点击 Continue" 还在最后**
当前 `ChatOptionCard.tsx` 把 `intro` 渲染在选项**上方**、`outro` 渲染在选项**下方**。AI 在 preflight system prompt 中被要求把"intro=开场寒暄、outro=点 Continue 即可开始"分开写，因此"请选择您偏好的选项，点击 Continue 即可开始制作"这条**真正的操作指引**永远出现在选项下方/最末位。

**问题 2：AI 暂不可用：Failed to fetch**
network 抓包显示 `POST /api/chat-stream` 返回 `Failed to fetch`（不是 4xx/5xx，是 TCP/Worker 直接断开）。chat-stream 路由在以下场景会触发同类异常：
- upstream `ai.gateway.lovable.dev` 调用挂起超过 worker 边界 timeout；
- POST handler 在 try 之外抛出未捕获异常（例如 `requireUserFromRequest` 之外的同步错误）；
- 前端 `chatMessage` 把 `TypeError: Failed to fetch` 直接当成原始错误显示，没有重试、没有友好兜底。

**问题 3：项目详情页点 task 闪退**
`handleOpenTask` 已加 `canRestoreTaskRecord` 校验，但是：
- `restoreTask` 对 `status === "running"` 的历史任务（其实是另一个会话还在跑的活动任务）也会 setState，把 `phase` 设成 "running" 但 timers/stages 都是空，工作区随后渲染半截的 running 任务、轮询触发 `undefined` 引用导致整页崩；
- 路由 `index` 没有 `errorComponent`，一旦 Workspace 子树抛错就白屏 / 闪退。

## 修复方案

### 1. 引导语统一渲染在选项上方
- `src/components/sc/ChatOptionCard.tsx`：
  - 删除选项**下方**的 `outro` 块；
  - 在选项**上方**先后渲染 `intro` 和 `outro`（两段并列，outro 用次级灰度），确保所有引导文本都在 chips 之前；
  - submit 之后保留 intro，作为已采纳状态的上下文。
- `src/routes/api/chat-stream.ts` (preflight system prompt)：
  - 把 outro 字段的语义改为"可选的轻量备注"，并明确**主要指引（点选 + Continue）必须写在 intro 里**；
  - 默认兜底 `intro = "好的，先确认几个关键方向，选完点 Continue 我就开始制作。"`，outro 默认空字符串而不是带"Continue"的句子。

### 2. chat-stream 稳定性 + Failed to fetch 兜底
- `src/routes/api/chat-stream.ts`：
  - 在 POST handler 最外层用 `try/catch` 包住整段逻辑，任何未预期异常都返回 `Response.json({ error: "internal", detail }, { status: 500 })`，**绝不**让 worker 静默断流；
  - upstream `fetch(ai.gateway.lovable.dev)` 加 `AbortController`（45s 超时）+ 上游网络错误时 `emit("error", …)` 并 `controller.close()`；
  - 流读取 `while (true)` 也包 try/catch，错误同样走 `emit("error")`。
- `src/lib/sc/store.ts.chatMessage`：
  - 捕获 `fetch` 自身抛出的 `TypeError`（Failed to fetch），统一走 `failWith("网络异常，请稍后重试")`；
  - 在 catch 分支里**自动重试一次**（最多 1 次，间隔 800ms），仍失败再展示错误；
  - failWith 的文案改成 "AI 暂时无法响应：{reason}，请重试或检查网络"，并附一个 "重试" chip（action 触发 `chatMessage(原 prompt)`）。

### 3. 项目详情页点 task 不再闪退
- `src/lib/sc/store.ts`：
  - `canRestoreTaskRecord`：若 `rec.status === "running"` 且 `rec.id !== get().taskId`，返回 false（活动任务不能在新会话冷启动恢复）；
  - `restoreTask`：把"另一个会话残留的 running" 视同 `interrupted`，restoredPhase 走 `failed` 兜底分支，所有 stage 中 `running/recovering` 强制降级为 `failed/pending`，并清空 `videoTasks` / 计时器。
- `src/routes/projects.$projectId.tsx.handleOpenTask`：
  - 当 `candidate.status === "running"` 且不是当前 task，直接 `toast` 提示"该任务正在另一会话中生成，请稍后再来查看"，不跳转；
  - try/catch 失败时同样 toast 而不是静默 console.error。
- `src/routes/index.tsx`：
  - 给 `createFileRoute("/")` 补 `errorComponent`，渲染"工作区加载失败 + 返回首页 + 重置"按钮，避免 Workspace 子树异常时整页白屏。
- `src/components/sc/Workspace.tsx`（仅根层）：包一层 `StageBoundary`/通用 ErrorBoundary，让 stage 渲染错误不会冒泡到 route 级别。

## 验收

1. 进入新任务、确认 brief 后，**所有引导文本都在选项 chips 之前**；点击选项后引导文本保留为已采纳上下文。
2. 故意制造网络异常（或 upstream 503）→ 聊天框不再只显示 "Failed to fetch"，而是友好提示 + 自动重试 + 重试按钮。
3. 从 `/projects/:id` 列表点击：
   - 已完成任务：正常进入工作区回放，不闪退；
   - 失败 / 中断任务：进入后看到 stage 恢复 + 重做 chips；
   - 仍在另一会话运行中的任务：toast 提示且不跳转；
   - 工作区内部如有渲染错误：route errorComponent 提供"重试 / 返回首页"，绝不白屏。

## 不动的范围

不动 Sidebar、视频生成 pipeline、credit ledger、storage 桶策略、其他路由与样式系统；只触达上面列出的文件。
