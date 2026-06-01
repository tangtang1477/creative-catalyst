
# 修复视频素材使用 & 聊天流式交互

## 问题一：视频内容不全 + 15s 变 10s

### 根因
1. `runLife`（store.ts L913-1010）只取 paint 阶段**第一个**关键帧 + brief.prompt 调用一次 `first-frame-to-video`，**完全忽略**：
   - 其他 A02..A0N 关键帧
   - wardrobe 服装/道具图（W01/W02/P01）
   - 每个 shot 自己的 prompt / motion / scene 描述
2. Seedance i2v 单次只支持 5s 或 10s，`clampSeedanceDuration` 把 15s 直接压到 10s；30s 同理被压到 10s，没有走多段拼接路径。

### 方案
**A. 按 shots 数量切成多段视频片段，再拼接：**

- 新增逻辑：`runLife` 不再生成单条 V01，而是按 `script.shots` 顺序为每个 A0N 生成一段 V0N。
- 每段调用 `reference-image-to-video` 路由（已在 seedance.functions 白名单中），payload：
  - `image_url`: 对应 A0N 的关键帧 url
  - `reference_image_urls`: wardrobe 中 W01/W02/P01 的 url（最多 6 张，已有锁定参考的成熟逻辑可复用 QC 那段）
  - `prompt`: 该 shot 的 `prompt + motion + scene`
  - `duration`: 按 shot.duration 解析后 clamp（每段还是 5/10s）
  - `ratio`: 沿用 brief 整体比例
- 单段封顶 10s，但允许多段组合达到 brief 要求时长（15s ≈ 5+10，30s ≈ 10+10+10，60s ≈ 6×10 等），由调度器在 client 决定段数：`Math.min(shots.length, Math.ceil(requestedDuration / 10))`。
- 资产列表新增 V01..V0N（每段独立 status / 进度 / 重做按钮），并在 MediaRail 中按顺序排列；wardrobe 内现成的 VersionDrawer 沿用。
- 当所有段 Ready 后，写入一条 "stitched" 元数据（暂用前端连续播放占位，不真正合并 mp4，避免后端复杂度），summary 标注「6 段拼接 ≈ 30s」。

**B. 时长提示对齐：**

- 移除「自动调整为 10s」的静默 clamp。改为：在 runLife 入口算出 `segments × perSegment ≈ requestedDuration`，appendSummary 明确「将以 N 段 × Xs ≈ 总 Ys 输出」。
- 若 shots 数 < 期望段数，提示「镜头不足，将按现有 N 段输出，总时长 ≈ Ys」，不再硬塞到一段 10s。

**改动文件**：`src/lib/sc/store.ts`（runLife 重写）、`src/lib/sc/types.ts`（Asset 增加 segmentIndex 字段，可选）、`src/components/sc/MediaRail.tsx`（按 segmentIndex 排序）。

## 问题二：In-task chat 改成流式 + 工具调用展示

### 现状
- `chat.functions.ts` 一次性 `await fetch` → 完整 JSON 返回 → store.ts L1226 `await chatReply` 后才推一条 agent msg。
- Workspace.tsx L285-323 渲染纯文本，无 thinking / tool-call / 折叠状态。

### 方案
**A. 后端改 SSE streaming**：
- `chat.functions.ts` 中 fetch body 加 `stream: true`，handler 返回 `Response` (SSE) 而非 JSON。
- 因为 `createServerFn` 不便返回流，改用 `src/routes/api/chat-stream.ts`（server route，类似 `routes/api/generate-image.ts` 的模式）走 POST SSE：转发上游 chunk，附带 `tool_calls` 增量。

**B. 前端流式接收**：
- store.ts 新增 `sendChat`：先 push user msg + 占位 agent msg（带 `streaming: true`），fetch SSE 用 `ReadableStream.getReader()` 解析 `data:` 行，逐块 append 到 agent msg.text；遇到 tool_call delta 追加到 `agent.toolCalls[]`。
- types.ts 中 `ChatMsg` 增加 `streaming?: boolean`、`toolCalls?: ChatToolCall[]`、`thinking?: string`。

**C. Chat 消息 UI（Workspace.tsx 内 agent 分支抽到新组件 `ChatAgentMessage.tsx`）**：
- 顶部：流式文本（光标 caret 动画，沿用现有 `[animation:stream-fade]`）。
- 中部：工具调用区，复用 `<ToolCallLine>` 显示 running/done；点击行展开 Input/Output 两段（折叠态显示 label + 0.x s，展开态显示请求 payload 摘要 + 返回片段 / 关联资产），与 StageRow 折叠风格保持一致（chevron + max-height transition）。
- 底部：actions chips（retry-stage / rerun-all）保留。
- 流式完成后 caret 隐藏，整条消息可继续点工具行展开/收起。

**改动文件**：
- 新增 `src/routes/api/chat-stream.ts`（SSE 路由）
- 新增 `src/components/sc/ChatAgentMessage.tsx`
- 修改 `src/lib/sc/store.ts`（sendChat 改 stream）
- 修改 `src/lib/sc/types.ts`（ChatMsg 字段扩展）
- 修改 `src/components/sc/Workspace.tsx`（agent 分支替换为 `<ChatAgentMessage>`）
- `chat.functions.ts` 保留作为非流回退（出错时降级）

## 验收
1. 默认 15s 任务：生成 ≥2 段视频片段（5s + 10s 或 3×5s），summary 显示「N 段 × X s ≈ 15s」，每段用对应关键帧 + wardrobe refs 调用，不再只用 A01。
2. 30s 任务：3-6 段，每段独立 retry。
3. In-task 聊天发送后：agent 气泡即时出现，文本逐字流入，期间显示 "Using skill chat-director" 等工具行，可点击展开输入/输出，符合 ToolCallLine 既有视觉。
4. 失败或 SSE 中断时自动回退到非流模式并提示。
