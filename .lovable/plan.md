# 改造目标

让 in-task 聊天 + 整个生成流程的"流式输出"完全对齐参考视频（Higgsfield 风格）；并在用户真正开拍前主动弹出一组选项卡片让用户点选，而不是逼用户自己输入。

---

## 1. 修复 M 头像尺寸（`ChatAgentMessage.tsx`）

参考视频里 AI 回合根本**没有头像气泡**，只有顶部一行 `✨ Using skill xxx`。我们既要保留品牌 M，又要解决用户截图里"M 太小、跟右侧 toolCall 卡片不齐"的问题：

- 删除当前 `h-6 w-6` 的小 M 头像。
- 改为参考视频的版式：
  - **顶部一行** `[小图标] Using skill chat-director`（小号 11px，accent 渐变文本）。
  - **正文/卡片左侧**不再有头像列，整段贴左对齐，最大宽度撑满 chat 列。
- 把 M Logo 留在 `phase === "empty"` 的 hero 区（已经存在的 12×12 大图标）和侧边栏，不在每条聊天里重复。

这样视觉上就不会出现"M 比容器矮一截"的问题。

---

## 2. 重做"流式输出"主体样式

让 `ChatAgentMessage` 的渲染顺序完全对齐视频（自顶向下）：

```
✨ Using skill chat-director
（流式 markdown 正文，逐字出现，无气泡背景，直接贴页面）
┌──────────────────────────────────────────┐
│ 1. 问题 A?                               │
│   [选项 1] [选项 2] [选项 3] [Other]     │
│ 2. 问题 B?                               │
│   [选项 a] [选项 b] [Other]              │
│                          [Skip] [Continue]│
└──────────────────────────────────────────┘
（继续流式正文…）
[ ⏳ Building the scene ]   ← 底部状态药丸
```

具体改动：

- **去掉现有 `toolCalls` 4 行列表卡片**（理解需求 / 匹配镜头 / 评估改动 / 生成回复）。视频里没有这种"分步骤打勾"的样式，它会让流式看起来卡顿。改成：
  - 顶部 `Using skill` 一行（图标 + 渐变色技能名 + 灰色副标题，例如 `chat-director · refining shot`）。
  - 正文直接 markdown 渲染（用 `react-markdown`），支持流式逐字（保留闪烁光标）。
  - 流式 phase 的进度感放到**底部状态药丸**里（见下），不再占顶部空间。

- **底部状态药丸 `StreamStatusPill`**（新组件，固定在该 AI 回合最末）：
  - 圆角方块图标 + 一句正在做的事，文案随阶段轮换：`Building the scene` → `Adding the details` → `Painting the frame` → `Bringing it to life` → `Awaiting your input`。
  - 完成时整个药丸收起（不留痕迹）。
  - 后端 SSE 的 `phase-start` / `phase-done` 事件继续用，但只驱动药丸文案 + 进度光标，不再生成可展开 tool 行。

- **用户消息气泡**保持现在的 `bg-surface-2 rounded-2xl`，不动。

---

## 3. 开拍前的"选项卡片"（核心新增）

参考视频最重要的一点：模型并不会等用户自己写"60 秒 / 冷静反差 / 全程交给你发挥"，而是**主动列出 3–4 个有限选项让用户点**。我们要在 `phase === "intake"` 之后、`stages.structure` 开跑之前，加一段交互式 brief refinement。

### 数据结构

`src/lib/sc/types.ts` 新增：

```ts
export interface ChatOptionQuestion {
  id: string;                 // "duration" / "tone" / "subject" ...
  label: string;              // "大概想要多长的短片？"
  multi?: boolean;            // 默认单选
  options: Array<{ id: string; label: string; hint?: string }>;
  allowOther?: boolean;       // 是否带 Other 自定义
  selected?: string[];        // 用户选中的 id
  otherText?: string;
}

export interface ChatOptionCard {
  id: string;
  questions: ChatOptionQuestion[];
  status: "awaiting" | "submitted" | "skipped";
  primaryLabel?: string;      // 默认 "Continue"
}
```

`ChatMsg` 增加 `optionCards?: ChatOptionCard[]`。

### 后端 / 编排

`src/lib/sc/store.ts` 在收到 brief 后新增 `requestPreflightOptions()`：
- 调 `/api/chat-stream`，给一个新的 `mode: "preflight-options"` 让 server 端用专门的 system prompt 让 Gemini 直接输出 JSON（不是 thinking 块）：

  ```json
  {
    "intro": "好，这是个 Full Heavy 流程（多场景叙事短片）。先问几个关键细节再开始：",
    "questions": [
      { "id": "duration", "label": "大概想要多长的短片？",
        "options": [
          {"id":"60s","label":"~60秒（4个场景）"},
          {"id":"2m","label":"~2分钟（8个场景）"},
          {"id":"3m","label":"~3分钟（12个场景）"}
        ], "allowOther": true },
      { "id": "tone", "label": "搞笑恐怖的方向偏哪种？",
        "options": [...], "allowOther": true },
      { "id": "character", "label": "角色方面有偏好吗？",
        "options": [...], "allowOther": true }
    ],
    "outro": "选完点 Continue，我就跑完整流程；想自己说也可以直接 Skip。"
  }
  ```

- `chat-stream` 增加分支：当 `mode === "preflight-options"`，跳过 thinking 解析，直接把整段 JSON 作为 `event: option-card data: {...}` 一次性推送，正文部分继续 token 流（intro/outro 分别用 `event: token`）。
- 前端 `store.chatMessage` 解析 `option-card` 事件 → 追加到 `optionCards`。

### 前端 UI

新增 `src/components/sc/ChatOptionCard.tsx`：
- 圆角边框卡片（`rounded-xl border border-border/60 bg-surface/40 px-4 py-3`，配合视频里的浅描边）。
- 每个 question 渲染：编号 + 标题 + 一排 chip 按钮（复用 `SCButton variant="chip"`）。
- 选中态用 accent border；`allowOther` 显示 `Other` chip，点开变成 inline `<input>`。
- 底部右对齐 `Skip` (ghost) + `Continue` (primary，带 ⌘↩ 提示)。
- 提交时调用 store 的 `submitPreflightAnswers(cardId, answers)`，把答案合并到 `brief.refinements`，再调 `runStage("structure")` 等后续流程；卡片状态切到 `submitted`，所有 chip 锁定为只读高亮。

### 复用范围

`ChatOptionCard` 不止用在开拍前——把现有 `ApprovalChips`（每个 stage 完成后让用户 approve / retry / refine）也迁到这套数据结构，统一视觉。这样：
- 流程开始前：`preflight options` 卡。
- 每个 stage 完成后：`approval` 卡（"这版巴黎公寓场景图符合预期吗？" + chips）。
- 用户在 chat 里发文本时，AI 回复也可以再附 chip 卡片（例如 "想要哪种镜头节奏？"）。

---

## 4. 技术细节

- 文件
  - 改：`src/components/sc/ChatAgentMessage.tsx`、`src/components/sc/Workspace.tsx`、`src/lib/sc/store.ts`、`src/lib/sc/types.ts`、`src/routes/api/chat-stream.ts`、`src/components/sc/ApprovalChips.tsx`
  - 新增：`src/components/sc/ChatOptionCard.tsx`、`src/components/sc/StreamStatusPill.tsx`
- 依赖：`bun add react-markdown remark-gfm`（正文流式 markdown）。
- Tokens：所有颜色走 `--surface / --border / --accent`，不写裸 hex。
- 兼容：旧的 `toolCalls` 字段保留可选，渲染时优雅降级（如果没拿到 `optionCards`/markdown，就回退到现状）。

---

## 验收

1. M 头像问题消失：每条 AI 回合顶部只有 `✨ Using skill xxx`，无错位的小圆头像。
2. 流式正文像参考视频一样**逐字铺在页面上**（无气泡背景），右下角有闪烁光标。
3. 用户首次确认 brief 后，**自动出现一张多问题选项卡**，能点 chip、能 Other 自定义、能 Skip / Continue；提交后才推进到脚本阶段。
4. 流程中 AI 的每条新回复都按这个版式渲染；底部状态药丸文案随阶段切换，结束时收起。
5. 视觉细节（描边、间距、chip 圆角、字号）与三段视频一致。
