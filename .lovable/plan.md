## 本轮要解决的 6 个问题

### 1. 真实积分消耗 — 接入后端
**现状**：`useCredits` 仅前端 zustand + localStorage，不会同步到 Supabase。
**改动**：
- 新增 `credit_ledger` 表（user_id, task_id, stage, label, cost, kind: 'consume'|'topup'|'refund'）+ RLS。
- 新增服务函数 `consumeCredits` / `getCreditsBalance`（`src/lib/credits.functions.ts`），在数据库侧原子扣减。
- `credits-store.ts.consume()` 改为先调服务函数成功后再更新本地缓存；启动时通过 `getCreditsBalance` 同步真实余额。
- 失败素材统一不扣减（catch 路径不调 consume）。

### 2. 不覆盖原素材 — Gallery 支持版本/分类
**现状**：`updateAsset` 直接改写 `url`；retry/QC 修正/批量编辑后老版本丢失。
**改动**：
- `Asset` 增加 `versions: { url, createdAt, source: 'init'|'qc-fix'|'manual-retry'|'batch-edit', note? }[]` 与 `currentVersion` 指针。
- 任何重新生成（wardrobe/paint 的 retry、`applyQCFixInternal`、`batchEditAssets`）改为：保留旧 `url` 进 `versions`，新版本 append。
- `MediaRail` Gallery 增加分类 Tab：服装道具 / 关键帧 / 视频 / 修正历史；每个资产卡片右下角加 "v2/v3" badge + 点击展开历史版本对比（缩略图横向滚动）。
- `AssetCard` 失败重试不覆盖最后成功版本。

### 3. 服装/道具 & 关键帧数量动态化
**现状**：`generateScript` tool schema 写死 `wardrobe minItems/maxItems: 3`、`shots: 5`，store 也按定长插入。
**改动**：
- `script.functions.ts` schema 改为 `wardrobe: 2–8`、`shots: 3–12`；`SYSTEM_PROMPT` 加入"按主题复杂度决定数量，不要强行凑数也不要硬限 3/5"，wardrobe id 改成自增 `W01/W02/.../P01/P02/...`、shots `A01..A0N`。
- `runWardrobe` / `runPaint` 完全以脚本返回的数组长度驱动（已经做了一半，去掉对 `W01/W02/P01` 的硬编码引用：QC 取 wardrobe 参考时用 `stageId === 'wardrobe'` 全集；`paint` 思考块的 thumbAssetIds 用脚本返回的 ids）。
- 估算积分：UI 上 "本批将消耗 X 积分"按真实数量计算。

### 4. Seedance duration 报错 + 失败卡片样式
**根因**：错误信息 `the parameter duration specified in the request is not valid for model doubao-seedance-2-0 in i2v` —— doubao-seedance-2-0 (i2v) 只接受 **5 / 10 秒**。用户的 "9:16 · 30s" → duration=30 → 直接 BadRequest。
**改动**：
- `seedance.functions.ts.SubmitInput` 增加 duration 白名单校验（i2v 路由仅允许 5/10），提交前在 store 侧把 30s clamp 为 10s 并 `appendSummary` 说明：实际渲染分段为 10s（或后续多段拼接，目前先单段 10s 兜底）。
- 失败卡样式重做（`AssetCard` failure 分支）：
  - 整张卡 = `aspect-ratio: 9/16` 满铺红色 `surface` 描边（不是上方小框 + 错位），统一 padding。
  - 内容垂直居中：图标 / "生成失败" / 错误信息折叠 / "未扣积分" badge / "重试" 按钮，统一字号与 gap。
  - 错误信息超长用 "查看详情" 弹出 dialog 展示完整 JSON，而不是 line-clamp 错位。

### 5. 历史任务回放 — 完整内容
**现状**：`persistCurrent` 只存 `summary.slice(-6)`，且 `toolCalls/thoughts` 完全丢失；`Workspace` 对 restored 任务直接跳过 interactive children。
**改动**：
- `TaskRecord.stageSummaries` 升级为 `stageSnapshots: Partial<Record<StageId, { summary: string[]; toolCalls: ToolCall[]; thoughts: Thought[]; status }>>`，保存完整（不再 slice -6）。
- `restoreTask` 还原完整 stages（包括 toolCalls / thoughts）。
- 移除 `isRestored` 跳过逻辑，回放时所有 ThinkingBlock / ToolCallLine 都可展开看全文。
- `script` 也持久化到 TaskRecord，回放时 ScriptTable / StoryboardTable 正常渲染。

### 6. 失败任务回放 + Agent 容器样式
- `restoreTask` 失败时：保留失败原因（每个 Failed asset 的 errorMessage 已存），在主时间线最末插入一条 agent 消息："本任务在 X 阶段失败，原因：…。要我重做这一步还是整段重来？" 配两个按钮（重做该阶段 / 重做整个任务），调 `retryStage` 或 `submit(brief.prompt)`。
- Agent 消息容器（`Workspace.tsx` 第 304–311 行）改为**无边框**：去掉 `border border-border bg-surface`，仅保留正文与图标；`Logo`（M 头像）外加 `ring-1 ring-border rounded-full p-1`。

---

## 涉及文件

新增：
- `src/lib/credits.functions.ts`
- supabase migration: `credit_ledger` 表 + RLS + GRANT

修改：
- `src/lib/sc/types.ts`（Asset.versions, TaskRecord.stageSnapshots）
- `src/lib/sc/store.ts`（consume 异步、wardrobe/paint 不再硬编码、版本管理、restoreTask 还原完整、失败时插入 agent 消息）
- `src/lib/sc/credits-store.ts`（接入后端余额）
- `src/lib/script.functions.ts`（数量放宽 + 命名规则）
- `src/lib/seedance.functions.ts`（duration 校验）
- `src/components/sc/AssetCard.tsx`（失败样式重做 + 版本 badge）
- `src/components/sc/MediaRail.tsx`（分类 Tab + 版本历史抽屉）
- `src/components/sc/Workspace.tsx`（agent 消息容器无边框、M 头像加框、移除 isRestored 跳过、失败重做按钮）
- `src/lib/sc/format-utils.ts`（新增 `clampSeedanceDuration`）
