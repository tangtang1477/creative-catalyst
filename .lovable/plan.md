## 背景

截图里两个问题：

1. **历史 / 中断项目里 chat 没法控制重生成。** `CommandInput.doSubmit` 在 `phase !== "empty"` 时一律走 `chatMessage()`，只会用 `/api/chat-stream` 给一段文字回复。`chatMessage` 只在模型主动吐 `<directives>` 时才有副作用（`applyAgentPatch` → 局部改图 / 偶发 retryStage）。当用户对一个 `done / failed / interrupted` 的项目说"继续生成"、"重新做下一集"、"接着上一步往下跑"这种意图，pipeline 永远不会再启动，agent 也没有"使用 tools / skills 的思考流"展示，只剩干巴巴的文字。

2. **preflight 选项提示语顺序错。** `chat-stream.ts` preflight 分支按 `intro → option-card → outro` 顺序 emit；但 `ChatAgentMessage` 把 `visibleText`（intro+outro 拼一起）整段渲染在 `optionCards` **之前**。结果用户看到的是：开场白 + "选择好后请点击继续" **连在一起**，选项卡被推到下面（甚至 questions 解析失败时干脆没卡片），引导语和实际操作位置完全错位。

---

## 修复方案

### 1. Chat 真正驱动生成 loop（含完整流式思考 / 工具调用）

**1.1 新增 agent-side intent 路由器（前端 store）**

在 `src/lib/sc/store.ts` 的 `chatMessage` 里：调用 `/api/chat-stream` 时新增 `mode: "agent-loop"` 分支（保留 chat 模式做兜底），并把当前 task 状态（`phase / failedStageId / 最后一个 ready stage / assets 概要`）一并送进 context。后端返回的 `directives` schema 扩展以下"真动作"：

```text
{
  "actions": [
    { "kind": "resume-from", "stageId": "..." },        // 从指定阶段继续/重做
    { "kind": "rerun-all" },                            // 整任务重跑（带新 prompt）
    { "kind": "generate-next-episode", "prompt": "..." }, // 复用现 assets 起新一集
    { "kind": "retry-stage", "stageId": "..." },        // 已有
    ...
  ],
  "patch": { ... },          // 已有
  "imageEdits": [ ... ]      // 已有
}
```

`applyAgentPatch` 新增 `actions` 处理：

- `resume-from` / `retry-stage` → 调 `get().retryStage(sid)`，并把 `phase` 切到 `running`。
- `rerun-all` → 用合并后的 prompt 调 `get().submit(...)`（保留 attachments）。
- `generate-next-episode` → 调 `get().submit(prompt, { kind: "series", inheritFromTaskId })`（已有 series 路径）。

**1.2 让 chatMessage 在 task 不是 `empty` 也能触发真正的 agentic loop**

`CommandInput.doSubmit` 改为：

- `phase === "empty"` → `submit()`（不变）。
- 其它 phase → 仍调 `chatMessage()`，但 `chatMessage` 内部根据后端返回的 `actions` 直接驱动 pipeline，不再要求用户额外点 chip。

**1.3 真正的流式"思考过程 + 工具/技能"展示**

后端 `chat-stream.ts` 的 agent-loop 分支按下列顺序 emit（复用现有 phase / phase-start / thinking / phase-done / token 事件，前端已支持）：

```text
phase: { id: "intent",  label: "理解你的指令" }
phase: { id: "context", label: "读取当前任务状态" }
phase: { id: "plan",    label: "选择要调用的 skill / tool" }
phase: { id: "act",     label: "执行任务" }
phase: { id: "reply",   label: "总结结果" }
```

System prompt 要求模型把每个阶段写进 `<thinking>## …</thinking>`，前端 `ChatAgentMessage` 已经把 `toolCalls`（即 phases）渲染成"Using skill xxx / Used skill xxx + 折叠摘要"——任务完成后变成"Used skill"灰色折叠态，正好满足"思考完成后折叠"的要求。act 阶段每调用一个真实动作（`retry-stage` / `submit` / `image-edit`）就额外 emit 一条 `phase` 子项展示具体 tool 名（`tool: retryStage(life)` 等）。

**1.4 中断任务专属入口**

`restoreTask` 里给 `interrupted` 状态的 task 主动追加一条 agent 消息 + 两个 chip：「从中断处继续」「整任务重跑」，让用户即使不打字也能一键续跑；同时这条消息走和 chatMessage 一样的流式 loop，保证视觉一致。

### 2. Preflight 提示语顺序修正

`src/routes/api/chat-stream.ts` 的 preflight 分支：把 option-card emit **之前**只 emit `intro`，**之后**才 emit `outro`。同时在前端 `ChatAgentMessage` 把消息正文拆成 `introText` / `outroText`，渲染顺序变成：

```text
[skill 行]
[introText]              ← "好的！…请点选您喜欢的选项："
[optionCards]            ← 选项 chip 卡
[outroText]              ← "选择好后，请点击继续…"
[awaiting-input 药丸]
```

实现方式：`ChatMsg` 增加 `outroText?: string` 字段；后端在 emit option-card 之后改用新事件 `event: outro` 携带 outro 文本，前端把它写到 `outroText`，渲染时放在 `optionCards` 之后。对老消息（没有 outroText）兼容：仍走旧的 visibleText 路径。

附带兜底：当 preflight 模型 JSON 解析失败 `questions = []` 时，直接放弃 option-card，把 intro+outro 合成一段普通文本并 fallback 到 `startRunning()`，避免出现"提示用户选但没有可选项"的死局（这正是截图当前的样子）。

---

## 涉及文件

- `src/routes/api/chat-stream.ts` — 新增 `agent-loop` 模式 & system prompt；preflight 改用 `event: outro`；空 questions fallback。
- `src/lib/sc/store.ts` — `chatMessage` 走 agent-loop；`applyAgentPatch` 处理 `actions`；`restoreTask` 给 interrupted 加入口；`ChatMsg` 增 `outroText`。
- `src/lib/sc/types.ts` — `ChatMsg.outroText`、`AgentDirectives.actions`。
- `src/components/sc/ChatAgentMessage.tsx` — 调整渲染顺序（intro → optionCards → outro）。
- `src/components/sc/CommandInput.tsx` — 文案微调（chat 输入框 placeholder 提示"可以下指令让 AI 继续/重跑"）。

不动：StageRow、Sidebar、项目详情页、wan/tasks functions、DB schema。

## 验收

1. 打开一个 `done` / `interrupted` 项目，在输入框说"继续生成下一集" → agent 出现 5 段流式思考、最终折叠，pipeline 真正 `submit()` 起来。
2. 在 `failed` 项目说"重做最后一步" → 触发 `retryStage(failedStage)`，life 阶段重新跑视频生成。
3. 首次提交 brief 后看到 preflight 卡：intro 在上、选项卡在中、"选择好后点继续"在下，questions 为空时不出现误导文案、直接进入制作。