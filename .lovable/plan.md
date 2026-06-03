## 目标

1. Chatbox 里说"把这张图改成 X / 加点雨 / 换背景"必须真正调后端改图，结果落到该 asset 的新版本里。
2. 在 AssetCard 上加一个 Lovart 同款的"图层编辑"入口（弹窗形式），可以挑选图层 / 圈选区域 + 写 prompt 真改图。
3. 支持上传剧本文件（txt / md / docx / pdf）并解析成现有 `GeneratedScript` 结构，直接进入 structure 阶段；流程全部走真实后端。

---

## 一、Chat 真改图（directives 扩展）

现状：`/api/chat-stream` 已能 emit `<directives>` 给 `patch / rerun`，但**没有**"对某个素材按 prompt 直接改图"的指令；用户在 chat 说"把 A03 改成雨夜"只会触发文字回复或把它当 brief patch。

改动：

- `chat-stream.ts` system prompt 新增第三种指令 `imageEdits`：
  ```json
  { "imageEdits": [
      { "assetId": "A03", "prompt": "把整体改成雨夜，加湿润反光", "refs": ["W01","P01"] }
  ]}
  ```
  规则：用户指向**具体已生成的图片 / 关键帧 / 角色卡 / 服装卡**做局部修改时使用；
  禁止与 `rerun` 同时输出；与 `patch` 可共存。
- `store.ts › applyAgentPatch` 增加 `imageEdits` 分支：
  - 对每条 `imageEdits[i]`：找到对应 asset → status 置 `Generating` → 调 `editImageWithRefs({prompt, imageUrls: [原图URL, ...refs解析为URL]})` → 上传 base64 → 作为该 asset 的新版本写入（沿用 `updateAsset` 的版本机制，原版本进入 `asset.versions`）。
  - 异常时回退 `Failed` + 不扣积分（与现有 qc 修正一致）。
  - 完成后向 chatLog 追加一条 agent 确认消息。
- 上下文增强：`Workspace.tsx` 在调 `/api/chat-stream` 时把当前 `assets` 的 `{id, label, caption, kind, stageId, hasUrl}` 摘要并入 `context`，让模型能正确写 `assetId`。

## 二、Lovart 同款图层编辑面板

入口：`AssetCard` hover 工具栏新增 "编辑" 按钮（铅笔图标），点开 `LayerEditDialog`（新文件 `src/components/sc/LayerEditDialog.tsx`）。

弹窗布局（左图 / 右控件）：

```text
┌──────────────────────┬─────────────────────┐
│                      │  图层 (chip 多选)    │
│   原图预览（可缩放）  │  □ 主体  □ 背景      │
│   + 可选画笔涂抹 mask │  □ 文字  □ 光影      │
│                      │                     │
│                      │  参考素材 (从图库挑) │
│                      │  [+W01] [+P01] …    │
│                      │                     │
│                      │  Prompt 输入框       │
│                      │  [应用编辑]          │
└──────────────────────┴─────────────────────┘
```

- MVP 不做像素级 mask 编辑（图层 chip + prompt 已能覆盖 80% 场景）；预留 `mask?: string` 字段供后续扩展。
- 提交时调用新的 server fn `editAssetWithLayers`（`src/lib/image-edit.functions.ts` 内追加），内部沿用 `editImageWithRefs` 的 gateway 调用，但把图层 chip 拼到 prompt 头：
  ```text
  Edit ONLY the following layers: {主体, 光影}. Keep other layers unchanged.
  User instruction: <prompt>
  ```
- 返回 base64 → `uploadBase64Image` → `useSC.addAssetVersion(assetId, url)`（如已有则复用，无则新增一个 store action：把当前 `url` 推入 `versions[]`，再把新 url 设为 `asset.url`）。
- 编辑历史直接走现有 `AssetVersionSwitcher`，无需新组件。

## 三、上传剧本 + 真实后端解析

入口：

- `AttachMenu.tsx` 新增一行 "上传剧本（.txt / .md / .docx / .pdf）"。
- `IntakeCard.tsx` 起步态也加一个 "我已经有剧本，直接导入" 链接，点开同一上传入口。

流程：

1. 文件先经 `uploadGenericFile` 上传到 storage（已存在）。
2. 客户端：
   - `.txt / .md`：直接 `await file.text()`。
   - `.docx / .pdf`：丢给新 server fn `parseScriptFile({ url, mime })`，server 端 fetch 文件 → 抽文本：
     - docx：`mammoth`（pure JS，Worker 兼容）。
     - pdf：`pdf-parse` 或 `unpdf`（验证 Worker 兼容；若不行回退到 gateway 多模态：直接把 pdf URL 当 `image_url` 之一交给 gemini-2.5-pro 提取文字）。
3. 拿到纯文本后调用新的 server fn `parseScriptText({ text, briefHint? })`：
   - LLM=`google/gemini-2.5-flash`，沿用 `script.functions.ts` 里 `emit_script` 同一个 tool schema，**直接复用 `GeneratedScript` 结构**；system prompt 改成"从用户已写好的剧本里抽取结构，不要二次创作，shots 数量按原剧本真实分镜数（最多 12）"。
4. 客户端：
   - `useSC.importGeneratedScript(script)`（新 action）：写 `script` + 跳过 intake/structure 生成、直接进入 wardrobe 阶段，同时 `appendSummary('structure', '已导入用户剧本')`。
   - 任务即时 `upsertTaskSnapshot` 落库。

## 涉及文件

新增：
- `src/components/sc/LayerEditDialog.tsx`
- `src/lib/script-parse.functions.ts`（`parseScriptFile` + `parseScriptText`）

修改：
- `src/routes/api/chat-stream.ts`（directives schema 加 `imageEdits`；上下文加 asset 摘要）
- `src/lib/sc/store.ts`（`applyAgentPatch` 增 `imageEdits` 分支；新 action `addAssetVersion`、`importGeneratedScript`；`/api/chat-stream` 调用处把 assets 摘要塞进 context）
- `src/lib/sc/types.ts`（`AgentDirectives` 增 `imageEdits?: {assetId, prompt, refs?}[]`）
- `src/lib/image-edit.functions.ts`（新增 `editAssetWithLayers`）
- `src/components/sc/AssetCard.tsx`、`AssetActions.tsx`（hover 工具栏加"编辑"按钮 → 打开 `LayerEditDialog`）
- `src/components/sc/AttachMenu.tsx`（加"上传剧本"行）
- `src/components/sc/IntakeCard.tsx`（加"我已经有剧本"入口）

依赖：可能新增 `mammoth`、`unpdf`（按 Worker 兼容性验证后再装）。

## 不做的事

- 不做像素级 mask 画笔（预留字段，留作 V2）。
- 不动 seedance / qc / wardrobe 既有链路。
- 不改数据库 schema（图层编辑结果复用 assets 表已有的 versions 机制；剧本导入复用 video_tasks.snapshot）。