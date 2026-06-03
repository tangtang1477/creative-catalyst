# 修复方案

## 1. 点击项目无法进入 / 显示"暂无本地历史"

### 现象
- 多数项目点击后只看到引导卡 "该项目暂无本地历史内容"，只有一个项目能恢复出内容。
- 这不是抛错，而是 `enterProject` 在 `taskHistory` 里没有找到任何 `projectId === projectId` 也没有 `title === proj.name` 的记录。

### 根因
1. 旧任务在 `projectId` / `snapshot` 列加上之前就已生成，所以 `video_tasks` 行里既没有 `project_id` 也没有 `snapshot`，远端 `listProjectTasks` 因为 `.not("snapshot","is",null)` 直接过滤掉了。
2. 即使是新任务，也只有 `persistCurrent` 真正把 `useProjects.getState().currentProjectId` 写进 `record.projectId`；如果用户是先 reset → 后才点 "新建项目"，task 已经在没有 projectId 的情况下落库。
3. `restoreTask` 在 `enterProject` 里只挑一条记录恢复，单项目下有多条历史时其余被埋没。

### 改动
- `src/lib/tasks.functions.ts`
  - `listProjectTasks`：去掉 `.not("snapshot","is",null)` 过滤，返回所有匹配 `user_id` + `project_id` 的行；snapshot 为空时由前端兜底。
  - 新增 `listAllUserTasks`（无 projectId 过滤）供"按标题兜底匹配"使用。
- `src/lib/sc/store.ts → enterProject`
  - 拉到 remote 后，对每条记录做"宽松归并"：若行无 snapshot，则用 `id/title/prompt/status/created_at` 构造一个最小 `TaskRecord`（assets 空数组、status 取数据库列），并强制写入 `projectId = r.project_id ?? projectId`。
  - 匹配顺序改为：`projectId 精确命中` → `title 命中（remote+local 全集）` → 取该 project 下最新一条 → 否则 reset 到空白态。
  - 命中后调用 `restoreTask`；reset 分支保持原有"无内容"卡片。
- `src/components/sc/Workspace.tsx`（ProjectGuideCard 区域）
  - 当 `taskHistory` 里存在 `projectId === currentProjectId` 的多条记录时，渲染一个紧凑列表（标题 + 时间 + 状态徽标），点击即 `restoreTask(id)`；只剩一条时维持原有引导文案。
  - 移除"暂无本地历史"作为唯一兜底——只有真正 0 条才显示该提示。
- 一次性数据修复（可选，留作后续）：在 `enterProject` 命中后台行但 `project_id` 为 null 时，调一次 `upsertTaskSnapshot` 把 `project_id` 写回，相当于自动回填。

## 2. 上传图样式 & @ 引用全链路改造

### 目标
1. 输入框上方的附件 chip 改为 **1:1 正方形缩略图卡**（约 44×44px），鼠标悬停显示文件名 + ✕。
2. `@` 弹窗里直接展示缩略图，文件名重命名为 `图片 1 / 视频 1 / 音频 1` 这种序号格式（按类型独立计数）。
3. 选中 `@` 项后，输入框里不再插入一长串 `@A01 / @img_v3_xxxx.jpg`，而是替换为一张可删除的迷你缩略图 chip。
4. 真实传参跑通：提交时把这些 chip 对应的 url 注入到 `script` / `wardrobe` / `cast` / `keyframe` 各阶段的 prompt 与 `references`，并在 StageRow 的 summary / ThinkingBlock 中渲染对应的小缩略图（"参考图：[🖼][🖼]"）。

### 改动文件

#### A. 附件数据模型
- `src/lib/sc/types.ts`：`Attachment` 新增 `displayName?: string`（如 "图片 1"），并保留原 `name`（原始文件名）。`addAttachment` 自动按 kind 计数生成 `displayName`。
- `src/lib/sc/store.ts`：
  - `addAttachment` 改为 `set((s)=>{ const n = s.attachments.filter(x=>x.kind===a.kind).length+1; const displayName = ({image:'图片',video:'视频',audio:'音频'}[a.kind])+' '+n; return { attachments:[...s.attachments,{...a,displayName}] }; })`。
  - 在 prompt 注入处（已有 `get().attachments.map` 三处）追加 displayName 注释，便于在 LLM 输出里复述。
  - 新增辅助 `getAttachmentByToken(token)`，把 `@图片1` 之类 token 解回 attachment。

#### B. AttachmentChips（输入框上方）
- `src/components/sc/AttachmentChips.tsx`：从横向文字 chip 改为 44×44 正方形缩略卡，`aspect-square` + `rounded-xl` + `object-cover`；顶角浮一个 ✕ 按钮；hover 时下方 tooltip 显示 displayName + 原文件名。视频/音频用 icon 占位+下方小标签。

#### C. MentionPopover（@ 弹窗）
- `src/components/sc/MentionPopover.tsx`：
  - item label 改用 `displayName`（attachments）；Ready 资产仍走 `@A01`。
  - 左侧缩略图放大到 36×36 圆角，右侧只显示 displayName + 类型标签。
  - 选中后回调 `onPick` 不再插入文字 `@图片1 `，而是插入一个占位 token：`[[ref:<id>]] `（详见 D）。

#### D. 输入框内联缩略图 chip
- `src/components/sc/CommandInput.tsx`：
  - 文本区保留普通 `<textarea>`，但提交前把 `[[ref:<id>]]` token 替换为 displayName（`图片1`）发给后端，同时把对应 attachment 加进 outgoing payload（已经在 store 里附加，不重复）。
  - 在 textarea 下方再加一行 "在 prompt 里引用的素材"：根据当前文本扫描 `[[ref:*]]`，渲染对应缩略图 chip（点击 ✕ 同时从文本里删除 token）。
  - 这样实现"输入框里看到的就是缩略图，不是字符串"的视觉效果而不破坏原 textarea。
- 兼容旧 `@A01` 资产引用：扫描器同时识别这类格式并渲染对应资产缩略图。

#### E. Summary / 思考过程渲染参考图
- `src/components/sc/StageRow.tsx` 与 `src/components/sc/ThinkingBlock.tsx`：
  - 把 summary 行从纯字符串改为"字符串 + 可选 thumbs"。`appendSummary` 增加可选参数 `(stageId, text, thumbs?: string[])`；类型升级 `StageState.summary` 为 `Array<string | { text: string; thumbs: string[] }>`，渲染时 text 后跟 16×16 圆角缩略图组。
  - 在 `runStructure / runWardrobe / runCast / runPaint` 触发时，若 `attachments` 非空，追加一行 `appendSummary(stage, "参考图：", attachments.map(a=>a.thumb||a.url))`。
  - `Thought` 已有 `thumbAssetIds`，复用：在生成 thought 时把 attachment url（非 asset）放进一个新字段 `thumbUrls?: string[]`，渲染同时 union 两者。

#### F. 真实传参打通
- 当前 `runStructure` 已把 attachments 透传给 `generateScript`；确认 `wardrobe / cast / paint / qc / life` 处的 `get().attachments` 注入路径都使用 url（已是）。本次新增：
  - `chat-stream.ts` 系统提示里加上一段：当用户消息含 `图片 N / 视频 N / 音频 N` 时，对应资源 url 列在末尾的 `[REFERENCES]` 段，agent 必须在生成 directive 时把 url 写进 `patch.brief.referenceUrls`。
  - `store.applyAgentPatch` 接受 `brief.referenceUrls` 并并入 attachments（去重）。

## 技术细节

```ts
// types.ts
export interface Attachment {
  id: string;
  kind: "image" | "video" | "audio";
  name: string;          // 原始文件名
  displayName?: string;  // "图片 1"
  url: string;
  thumb?: string;
  source: "upload" | "url" | "asset";
  ref?: string;
}

export type SummaryLine = string | { text: string; thumbs: string[] };
export interface StageState { summary: SummaryLine[]; /* ... */ }
```

```text
输入框结构
┌─────────────────────────────────────────────┐
│ [🖼44][🖼44][🎬44]  ← AttachmentChips         │
│ ─────────────────────────────────────────── │
│ textarea: 让 [[ref:a1]] 出现在第 1 集开头… │
│ ─────────────────────────────────────────── │
│ 引用: [🖼图片1✕] [🎬视频1✕]                  │
└─────────────────────────────────────────────┘
```

## 验收

1. 切换 3 个老项目，至少其中 2 个能看到历史任务列表（即使是空 snapshot），点击任一条能 restore。
2. 上传 1 图 1 视频后，输入框上方出现两个 44×44 缩略卡；`@` 弹窗下拉显示"图片 1 / 视频 1"+缩略图；选中后输入框里出现缩略图 chip，不是长文件名。
3. 提交任务后：scene/wardrobe/cast 的 summary 行末尾跟着缩略图组；ThinkingBlock 标题旁出现同样缩略图；生成的 wardrobe / cast 图像与参考图风格一致（URL 已传给后端）。
