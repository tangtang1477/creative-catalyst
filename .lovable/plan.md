## 现状诊断

聊天框 (`CommandInput` 调 `chatMessage`) 目前在 `src/lib/sc/store.ts` 第 909-937 行**只是返回硬编码模板**（"好的，需要我重新渲染哪些镜头？" 等），并没有调任何 LLM。所以"毛毡风金毛摊煎饼"和"重新按照真实内容做"得到相同回复。

之前接入的真实后端 = `generateScript`（剧本）+ `submitVideoTask`（Seedance 视频），**不包括对话**。

## 方案：聊天框接入 Lovable AI

### 1. 新建 `src/lib/chat.functions.ts`
- `chatReply` server function (createServerFn POST)
- 输入：`{ messages: {role: 'user'|'assistant', content: string}[], context?: { phase, brief, scriptSummary } }`
- 走 `https://ai.gateway.lovable.dev/v1/chat/completions`，model `google/gemini-3-flash-preview`，非流式（简单 invoke 返回字符串即可，保持现在 1 条消息的 UX）
- System prompt（中文）：你是 Vibe Aideo 的 AI 广告导演助手。当前任务上下文：phase=…，brief=…，已生成剧本镜头：A01-A05 …。用中文简洁回答用户关于剧本/分镜/重做/排期的问题；如果用户要求改某镜头或重做，回复你将如何执行（不要凭空编造，未生成时如实说明）。≤80 字。
- 错误：402 / 429 catch，返回友好文案

### 2. 改 `src/lib/sc/store.ts` `chatMessage`
- 仍然先 push 用户消息
- 调 `chatReply({ data: { messages: chatLog 最近 10 条 + 新用户消息, context: { phase, brief, script } } })`
- 成功 → push agent 消息；失败 → push 友好降级消息（"AI 暂不可用：xxx"），不再用硬编码模板
- 因为 store 是普通 zustand action，可以 `void (async () => {...})()` 异步，保持现有签名

### 3. UI 微调（可选，仅在调用期间）
- 在 agent 消息到达前显示一个 "思考中…" 占位（用现有 `GradientLoader` 或简单 typing dots）。如果实现复杂可先省略，本轮先把"回复真实"做正确。

### 4. 验证
- typecheck/build
- 控制台手动测试输入 "毛毡风金毛摊煎饼" 应得到关于该主题的中文回复，不再是模板。

### 涉及文件
- 新建 `src/lib/chat.functions.ts`
- 改 `src/lib/sc/store.ts`（仅 `chatMessage` 一处）