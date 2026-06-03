# 三处修复

## 一、历史项目恢复时信息展示不全

### 现状
图 1 中右侧 Assets 已经成功拉回 S01/S02/S03 三个视频，但中间区域只剩一张 `Selected Brief · RESTORED` 卡，所有字段都是 "—"，且没有任何 prompt / 分镜 / 阶段摘要 / 聊天记录。

原因：
1. `backfillLegacyTasksForProject` 合成快照时写死 `brief: null / script: null / stageSummaries: {} / stageSnapshots: {}`，只塞了 assets。
2. `restoreTask` 在 `rec.brief` 为空时回填了一个占位 brief（`adType: "Restored"`, format/visual/mode 全是 "—"），Workspace 又只要 `brief.adType` 非空就强制渲染那张「Selected Brief」卡。
3. 中间区域没有兜底叙事，所以"历史归档/已生成 N 个镜头"这种信息完全没出现。

### 修复方案

**A. 让回填能带回更多真实信息**（`src/lib/tasks.functions.ts` 中的 `backfillLegacyTasksForProject`）
- assets select 增加 `prompt, label, caption, poster` 等字段（meta 里有则一并读出）。
- 取该组 assets 中第一条非空的 `prompt / meta.prompt / meta.scene_prompt` 作为 `snapshot.brief.prompt`，没有则用 `project.name`。
- 写入 `snapshot.brief`：`{ prompt, adType: project.kind === "series" ? "Series" : "One-off", format: "—", visualSource: "—", mode: "Restored" }`，但加上 `legacyBackfill: true` 标记。
- 合成 `snapshot.script`：把每个 asset 转成一条 shot（`{shot:'A01', duration:'—', scene: a.meta?.scene ?? '', prompt: a.prompt ?? '', motion:'—', elements:'—'}`），数量同 assets。
- 合成 `snapshot.stageSummaries.life`：一行 "已从历史素材恢复 N 个镜头"；并补一行 "项目类型：{kind} · 创建于 {date}"。
- 给 `snapshot.assets` 每条加上 `prompt / caption / poster`（如果库里有）。

**B. 让 restoreTask 显示真实快照而不是占位**（`src/lib/sc/store.ts`）
- 删除把 brief 兜底为 `adType: "Restored", format/visual/mode: "—"` 的逻辑：当 `rec.brief` 不存在时，brief 设为 `{ prompt: rec.prompt || rec.title, adType: "", ... }`（adType 为空 → Workspace 不会渲染那张 "—" 卡）。
- 恢复后向 `chatLog` 追加一条 agent 提示："已从历史归档恢复 {assets.length} 个素材 · 项目 {projectName}。可以基于这些镜头继续生成下一集，或在右侧画廊里复用。"（含 "继续生成下一集 / 重新整理剧本" 两个 action chip，复用现有 action 机制）。
- 同时把 `script` 真实塞回去，使 ScriptTable 可见。

**C. Workspace 渲染兜底**（`src/components/sc/Workspace.tsx`）
- "Selected Brief" 卡的条件改为：仅当 `brief.adType && brief.format !== "—"` 才渲染那张四行卡；对 legacyBackfill / 无 brief 的任务改为渲染一张"项目快照"卡（显示：项目名、创建时间、镜头数 N、最后更新时间），样式沿用现有 surface 卡。

完成后图 1 应该能看到：项目快照卡 + script 表 + 阶段摘要（"已从历史素材恢复 3 个镜头"）+ 一条恢复提示对话。

---

## 二、AttachMenu 重新组织（`src/components/sc/AttachMenu.tsx`）

### 当前结构
```
上传文件 · 图片/视频/音频
上传剧本 · .txt/.md/.docx     ← 把单文件入口和它的快捷分类切开了
[ 图片 ][ 视频 ][ 音频 ]
粘贴 URL
```

### 调整后
```
── 媒体 ───────────────────
上传文件 · 图片/视频/音频
[ 图片 ][ 视频 ][ 音频 ]
粘贴 URL
── 剧本 ───────────────────
上传剧本 · .txt / .md / .docx / .pdf
```
- 用一条 `border-t border-border/60` 分隔，并各加 11px 的 section label（`媒体` / `剧本`）。
- "上传剧本" 移到分隔线下面，避免它把"上传文件"和下方的图片/视频/音频快捷按钮割裂。

---

## 三、剧本上传支持 PDF

### 后端：新增 `extractPdfText` server function（`src/lib/script-parse.functions.ts`）
- 用 `unpdf`（Worker 兼容、内嵌 WASM、TanStack Start 上可用）解析。
- 入参：`{ base64: string }`（≤ 10 MB）。
- 输出：`{ text: string }`（拼接所有页文本，trim，截断到 60k 字符）。
- 若 unpdf 抽到的文本为空（扫描件无内嵌文本层），回退调用 Lovable AI Gateway 的 `google/gemini-2.5-pro` 走 multimodal 把 PDF 当图像 OCR（PDF base64 + 系统提示"提取剧本文本，保留对白与场景描写"）。

### 前端（`AttachMenu.tsx`）
- script `<input accept>` 追加 `.pdf,application/pdf`。
- 文案改为 `上传剧本 · .txt / .md / .docx / .pdf`。
- `onScriptFile` 分支：`name.endsWith(".pdf")` → `file.arrayBuffer()` → base64 → `extractPdfText({data:{base64}})` → 拿到 `text` 后走原有 `parseScriptText` 流程。
- 增加 20 MB 大小校验和友好 toast。

### 依赖
- 安装 `unpdf`（纯 ESM，Cloudflare Workers 已验证可用）。无需 pdfjs/canvas/native binary。

---

## 技术细节速查
- `tasks.functions.ts`：扩展 select 列、生成 brief/script/stageSummaries，不改 RLS、不改表结构。
- `store.ts` `restoreTask`：去掉 "Restored" 占位 brief；插入恢复对话；保持 set() 结构。
- `Workspace.tsx`：拆分 "Selected Brief"（完整 brief）与 "项目快照"（legacy/无 brief）两种卡片渲染。
- `AttachMenu.tsx`：仅调整布局 + accept；不动 onFiles 主链。
- `script-parse.functions.ts`：新增 `extractPdfText`，复用现有 `parseScriptText`。
- 不动 Supabase schema、不动 client.ts。
