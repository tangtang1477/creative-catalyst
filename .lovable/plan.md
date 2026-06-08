## 问题排查

### 问题 1：用户在对话框追加指令时，思考过程没有按约定流式展示，并且出现 raw JSON 泄漏

观察用户截图：`Used skill chat-director` 之下直接是一句回复，没有任何"理解需求 / 匹配镜头 / 评估改动范围"思考阶段药丸，并且把 `{"actions":[{"kind":"rerun-all"}]}` 这种原始指令 JSON 直接打到了正文里。

读 `src/lib/sc/chat-stream-handler.ts` 与 `src/lib/sc/store.ts#chatMessage`，根因有两个：

1. 模型对**追加聊天**这种短消息有时会跳过 `<thinking>…</thinking>` 直接吐回复 + JSON。handler 在 L519 的 fallback 把三段全部 `phaseDone(i, "（跳过）")`，且**只 phaseStart(0) 过 1 次**，phase 1/2 从未 start → ChatAgentMessage 里 `runningTool` 找不到、`toolCalls` 列表也根本没渲染（因为我们把它当成 skillSub/loading pill 用，没有展开 thinking 文本本体）。
2. handler 只对**字面 `<directives>` 标签**做剥离（L347 起 emitReplyToken 检测 `<directives>`）。当模型偷懒输出裸 JSON（如 `{"actions":[...]}`）时，整段 JSON 跟着 token 透传到前端，`ChatAgentMessage.visibleText` 也只过滤 `<directives>` 标签 → JSON 直接出现在气泡里。

### 问题 2：从素材"add to task"塞进输入框的附件不会随用户消息进入对话

读 `src/lib/sc/store.ts#chatMessage`（L2718）发现：它**完全没有读 `get().attachments`，也没 clearAttachments**。而 `submit()`（首条 prompt）那条路径才用 attachments。所以一旦进入 chat 模式：
- 附件 chip 永远卡在 `AttachmentChips` 上方；
- 发送的 payload `context` 里不带 asset 引用，模型不知道用户在指哪张图；
- 用户继续打字、再次发送，chip 仍在那里 → 像"附件没跟随发出"。

---

## 改动计划

只动这三处，不碰其它模块、样式、文案，不引入新功能。

### 1) `src/lib/sc/chat-stream-handler.ts` — 让思考过程稳定出现 + 屏蔽裸 JSON
- **强约束系统提示**：在 systemPrompt 顶部加一句"**必须先输出 `<thinking>...</thinking>`，思考块内必须包含 3 个 `## ` 小节，缺一不可；最终回复后如需驱动 pipeline，必须用 `<directives>{...}</directives>` 包裹，禁止把 JSON 裸写在正文里。**"
- **fallback 也补齐阶段事件**：模型没按格式输出 thinking 时（L519 分支），先 `phaseStart(i)` 再 `phaseDone(i, "（跳过）")`，保证前端拿到完整 4 段事件、`Used skill` 那一行能跟上正在跑的子阶段。
- **裸 JSON 剥离**：扩展 `emitReplyToken` 的 directives 检测，除了 `<directives>` 还匹配以 `\n{` 或开头 `{` 出现、且包含 `"actions"|"patch"|"rerun"|"imageEdits"` 关键字的尾部 JSON 块；命中后停止 token 透传、把整段塞进 `replyAcc` 末尾，结束时按 directives 再解析一次（同样 emit `directives` 事件）。
- 客户端兜底：`ChatAgentMessage.visibleText` 已经会去 `<directives>`，再额外加一行 `text = text.replace(/\{\s*"(actions|patch|rerun|imageEdits)"[\s\S]*?\}\s*$/m, "").trimEnd()`，保证旧消息也不再露 JSON（只在 `ChatAgentMessage.tsx` 内部修，行为只是过滤，不影响布局）。

### 2) `src/lib/sc/store.ts#chatMessage` — 让附件跟随聊天发送
- 取消息时先 `const refs = get().attachments`。
- userMsg 仍按原样渲染文本气泡（不动 UI）；同时在拼 `payload.context` 时新增：
  ```
  refs: refs.map(a => ({ id: a.id, kind: a.kind, name: a.displayName ?? a.name, url: a.url, assetId: a.assetId }))
  ```
- 拼 history 时，若有 refs，把最后一条 user content 改写成 `"[引用素材：A03, W01] " + t`，让模型在 chat-director 思考里知道用户指的是哪个素材。
- 发送成功后 `set({ attachments: [] })`（沿用现有 `clearAttachments`），输入框上的 chip 自然消失。
- 不引入新的 ChatMsg 字段、不改 `ChatItemBoundary` 的 user 气泡渲染，避免动到样式。

### 3) `src/lib/sc/chat-stream-handler.ts` body schema — 读取 refs
- `body.context` 类型补一个可选 `refs?: Array<{ id; kind?; name?; url?; assetId? }>`。
- ctxLines 里追加：`if (ctx?.refs?.length) ctxLines.push("用户引用素材：" + ctx.refs.map(r => \`${r.assetId ?? r.id}(${r.kind ?? "asset"})${r.name ? " " + r.name : ""}\`).join("；"))`。
- 模型据此把 `imageEdits.assetId` / `actions.retry-stage` 等指向正确的素材。

### 不动的部分
- `AttachmentChips`、`CommandInput`、`Sidebar`、项目详情页、`wan.functions.ts`、轮询/失败原因逻辑全部保持原样。
- 不新增 chat 气泡里的素材展示组件；用户气泡仍只显示文本。如果后续想在用户气泡里同步显示小缩略图，再开一轮单独改。

### 验证
- 在正在跑的任务里发"把 A03 妆容再淡一些"：浏览器 Network 看 `/api/chat-stream` SSE 应能看到 `phase / phase-start / thinking / phase-done / token / done` 完整事件；ChatAgentMessage 顶部 `Used skill chat-director · 匹配当前镜头与品牌` 等子阶段会随流切换。
- 同一句话末尾不再出现裸 `{"actions":...}`。
- 在素材卡点 "Add to task" → 输入框出现缩略图 chip → 在输入框输入"把这张换成雨夜背景" → 发送：chip 消失，气泡只显示文字；模型回复中能识别到 A03/W01 并下发对应的 `imageEdits` directive。
