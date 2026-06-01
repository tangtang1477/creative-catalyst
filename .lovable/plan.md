
# 修复 In-task Chat：真流式 + 思考步骤 + Loading 占位

## 问题分析

当前 `/api/chat-stream` + `store.chatMessage` 已经接了 SSE，但用户看到的体验是：
1. **1.1s 后整段文字一次性出现** —— 不是真的逐字流。原因：单条 `chat-director · streaming reply` tool 行 1.1s 后才标记 done，配合 Gemini-2.5-flash 第一个 chunk 较大 + Worker 透传时被缓冲，token 没有"流"出来。
2. **首字到达前没有 loading** —— `ChatAgentMessage` 在 `text === ""` 时只显示一个闪烁竖线 caret，看起来像没反应。
3. **没有任务细节/思考过程** —— 只有一条 tool 行。之前主生成流程是多条 `ThinkingBlock` + 多条 `ToolCallLine`（理解需求 → 匹配镜头 → 评估改动范围 → 生成回复），chat 没复刻这个体验。

## 方案

### 1. 后端 `/api/chat-stream.ts`：升级为"分阶段事件流"

不再单纯透传 upstream.body，改为 server 主动编排一条 SSE 流，发出自定义事件：

```
event: phase    data: {"id":"intent", "label":"理解需求"}
event: phase    data: {"id":"context","label":"匹配当前镜头与品牌"}
event: phase    data: {"id":"plan",   "label":"评估改动范围"}
event: phase    data: {"id":"reply",  "label":"生成回复"}
event: phase-start  data: {"id":"intent"}
event: thinking     data: {"text":"用户希望调整 A03…"}     // 逐段
event: phase-done   data: {"id":"intent","summary":"调整 A03 关键帧的镜头节奏"}
...
event: phase-start  data: {"id":"reply"}
event: token        data: {"text":"好"}                   // 逐字 / 小批
event: token        data: {"text":"的，"}
...
event: done
```

实现做法（避免双次 LLM 调用拖长延迟）：
- 单次调用 `google/gemini-2.5-flash`，stream=true，system prompt 改为：先用 `<thinking>` 块输出 4 段简短分析（意图/上下文/计划/回复策略），再输出最终回复正文。
- Server 端用 ReadableStream 主动 `controller.enqueue`：
  - 立刻 emit `phase` 事件（4 个预设步骤）+ `phase-start: intent`。
  - 解析 upstream token：在 `<thinking>` 内的内容映射到当前 step 的 `thinking` 事件 + 在子段（用 `\n##` 或 `· ` 分隔）切换 phase-start/phase-done。
  - 离开 `</thinking>` 后切到 `phase-start: reply`，剩余 token 全部转为 `token` 事件。
  - 流结束 emit `phase-done: reply` + `done`。
- 关键头：`Content-Type: text/event-stream`、`Cache-Control: no-cache, no-transform`、`X-Accel-Buffering: no`，并在每个事件后立刻 enqueue（不要积累），让 Cloudflare 不缓冲。

### 2. 前端 `store.chatMessage`（store.ts）：解析自定义事件，维护多 step 状态

- agent 占位结构升级：
  ```ts
  agentMsg = {
    streaming: true,
    text: "",
    thinking: "",
    toolCalls: [],          // 每个 phase 一条
    actions: ...
  }
  ```
- SSE 解析支持 `event:` + `data:` 双行格式：
  - `phase` → push 一条 `toolCalls[]`（status: "pending"，icon=skill，label=步骤名）。
  - `phase-start` → 把该 id 的 toolCall 改为 `running`（startedAt=now）。
  - `thinking` → 追加 `agentMsg.thinking`，并把当前 running step 的 `input` 字段也增量更新（展开后可见）。
  - `phase-done` → 该 toolCall `status: "done"`，`durationMs`，`output: summary`。
  - `token` → 追加 `agentMsg.text`。
  - `done` → `streaming: false`，所有未 done 的 toolCall 强制 done。
- 失败（HTTP 非 ok 或网络中断）：回退到单条 fail toolCall + 友好提示，沿用现有逻辑。

### 3. 前端 `ChatAgentMessage.tsx`：增加 Loading 占位 + Thinking 块

- **首字未到的 loading 状态**：当 `streaming && !text && toolCalls.every(tc => tc.status !== 'done')` 时，在 text 区域显示：
  - 三个 pulse 点（复用现有 `.thinking-dots`）+ "正在思考…" 灰字。
- **Thinking 展示**：在 toolCalls 区域上方插入一个可折叠 `<ThinkingBlock>` 样式块（直接复用或新建一个轻量版 `ChatThinking`，body 行按 `\n` split），默认收起，标题取当前 running step 的 label。
- **多 step toolCalls**：现已支持，无需改 — 但要确保 `Loader2` 在 running 时一直转，pending（未开始）的 step 显示一个空心圆点占位。
- **token 流式渲染**：保留 `[animation:stream-fade]` 不变；caret 在 `streaming && text.length > 0` 才显示。

### 4. 验收

1. 发送消息后 **<100ms** 内 agent 气泡出现 4 行 phase（前 3 行 pending、第 1 行 running 旋转 loader），同时显示"正在思考…"占位。
2. 看到 phase 一个个变 done（带 ✓ + 耗时），点击任一行展开能看到该阶段的输入/思考摘要。
3. 切到 `reply` 阶段后，文字**逐字**追加，caret 跟随，整体感受像 ChatGPT 流式。
4. 错误（429/402/网络中断）时回退到一条失败 toolCall + 文字错误提示，不影响后续重试。

## 改动文件

- `src/routes/api/chat-stream.ts` — 重写为分阶段 SSE 编排（ReadableStream + token 解析 `<thinking>` 包裹）。
- `src/lib/sc/store.ts` — `chatMessage` 内的 SSE 解析升级为支持 `event:` 行 + 6 类事件，扩展 agentMsg 字段。
- `src/lib/sc/types.ts` — `ChatMsg.toolCalls[]` 元素新增 `pending` 状态；新增可选 `thinking?: string`（若未加）。
- `src/components/sc/ChatAgentMessage.tsx` — 加 loading 占位、pending 步骤样式、可选 ChatThinking 折叠块。

不动主生成流程（runLife / Seedance）— 本次只修 chat。
