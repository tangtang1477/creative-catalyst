
## 排查结论

| 现象 | 根因 |
| --- | --- |
| 聊天框里看到一整段 `<directives>{"patch":...}</directives>` raw JSON | 后端 `emitReplyToken` 只在 reply 阶段抑制；模型偶尔把标签放在 reply 起始边界附近（pendingHead/SAFE buffer 边界）或 thinking 后立即输出，导致 raw 文本写进了 `m.text`。前端 `ChatAgentMessage` 用 ReactMarkdown 直接渲染 `text`，没有兜底 strip。 |
| "合并成同一集" → 全部已生成镜头被重跑 | `applyAgentPatch` 收到 `rerun:["script"]` 直接 `retryStage("structure")`，而 `retryStage("structure")` 会把下游 wardrobe / cast / paint / qc / life 全部 reset。这个机制是"已实现"，不是"对旧项目无效"——是触发条件太宽。AI 系统提示对 rerun 的语义没有约束，把"合并/调时长/微调"也输出 rerun，导致破坏性后果。 |

---

## 修复

### A. directives raw 块兜底隐藏（双保险）

**`src/components/sc/ChatAgentMessage.tsx`**

- 渲染前对 `text` 做一次 `text.replace(/<directives>[\s\S]*?<\/directives>/g, "").replace(/<\/?directives>/g, "").trimEnd()`。
- streaming 中允许尾部部分匹配：若 `text.includes("<directives>")` 而无闭合，截断到 `<directives>` 之前再渲染。
- 这样无论后端抑制是否漏过、历史记录里是否残留，都不会再出现 raw JSON。

**`src/routes/api/chat-stream.ts`**（顺手加固，防止源头泄漏）

- `emitReplyToken` 的 `SAFE` 从 12 提到 `"<directives>".length + 4 = 16`。
- 在 `phaseStart(reply)` 切换那一刻，把 `pendingHead` 残留先扫一次 `<directives>`，存在则截断。
- 结束时已有的 `cleanReply` 处理保留不变。

### B. 收紧 rerun，让 chat 微调不再清空成片

**`src/routes/api/chat-stream.ts`** — system prompt 里增加硬性约束（追加到指令协议下面）：

```
- rerun 只能用于「用户明确说要重新生成/重画/重做某阶段」的场景。
- 用户说「合并/拆分/调整时长/改时长/微调/换个说法/再润色/把 A0X 改成…」这类局部 patch，
  必须只输出 patch，不输出 rerun 字段（或 rerun 为空数组）。
- 不要为同一改动同时输出 brief.format 调整和 rerun:["script"]——
  format 微调由前端自动应用，不需要重跑。
- 仅 wardrobe / cast / paint 这类「重新出图」的请求才允许出现对应 rerun。
```

**`src/lib/sc/store.ts` · `applyAgentPatch`** — 前端再加保险，避免坏模型仍然吐 rerun：

1. 计算"破坏性 rerun"：`rerun` 命中 `structure / wardrobe / cast / paint` 任一，且对应下游已有产物（`assets.some(a => a.stageId === 下游 && a.status === "Ready")`）。
2. 若破坏性，**不要直接 retryStage**，改为：
   - 应用 `patch`（brief / script / characters / scenes 字段合并）；
   - 通过 `pushAgentMsg` 追加一条 agent 消息附带 actions chip：「重跑 script（会清空 X 个已生成片段）」+「保留现有片段」，让用户自己点。actions chip 用现有 `kind:"retry-stage"` 类型（stageId 选 `structure` / `wardrobe` / …）。
3. 若非破坏性（下游没有 Ready 产物），保持现行 retryStage 行为。
4. toast 文案区分："AI 指令已应用（patch）" / "AI 指令已应用并需确认是否重跑"。

`retryStage` 自身不动，只调整调用门槛。

---

## 修改的文件

- `src/components/sc/ChatAgentMessage.tsx`（前端兜底隐藏 `<directives>` 文本）
- `src/routes/api/chat-stream.ts`（系统提示限制 rerun + SAFE 提升）
- `src/lib/sc/store.ts`（`applyAgentPatch` 加破坏性保护，弹确认 chip 不直接清空）

不涉及 schema/migration，不影响旧项目存档；旧 chatLog 里残留的 raw 块也会被 A 步骤吞掉。

---

## 验证

1. 重新发"合并成同一集" → 聊天框无 raw JSON；现有 V01–V03 不被清掉；底部出现「重跑 script · 会清空 N 段」chip 供选择。
2. 主动说"重新生成 A02 关键帧" → AI 输出 `rerun:["paint"]`，破坏性确认 chip 仍弹出（paint 下已有 Ready 资产）。
3. 老任务 restoreTask 后 chatLog 中历史 raw `<directives>` 文本也消失。
