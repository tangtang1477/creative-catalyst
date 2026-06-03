
## 目标

闭环上轮遗留的 4 个问题；同时修掉本轮发现的一个相关 bug（credit_ledger cost ≤1000 校验拒收 2000 的 Boost 消费，控制台已在刷错）。

---

## 1. 视频段安全审核兜底（reference-image-to-video 全段失败）

**根因**：Seedance 上游对参考图触发 `InputImageSensitiveContentDetected.PrivacyInformation` / `PolicyViolation` 时整段失败；当前并发提交 3 段，一旦某段触发，UI 只显示"全部视频段渲染失败"且把原始 JSON 直接抛给用户。

**改动**（`src/lib/sc/store.ts` 的 `runLife` 段 + `src/lib/seedance.functions.ts`）：

1. **错误归类**：在 `seedance.functions.ts` 解析上游 envelope 时识别敏感词错误码（`InputImageSensitive*`、`PolicyViolation`、`RealPerson*`），把 `errorCode` 规范化为 `policy_real_person` / `policy_violation` / `submit_failed`，并把 `errorMessage` 转成中文短句（"参考图疑似包含真实人物，已自动降级重试"），原始 JSON 收进 `meta.upstream`，不再直接抛给前端。
2. **逐段自动降级重试**：在 `runLife` 单段失败 + `errorCode === "policy_real_person"` 时，自动剔除 character 类参考图（只保留 scene plate + keyframe），用 `text-to-video` 路由再试一次；仍失败才标 `Failed`。
3. **并发兜底**：保留并发提交，但把 `okCount === 0` 的复盖文案改成"其中 N 段被上游安全审核拒绝，可在下方单独重做（提示更换参考图或描述）"，并在每段卡片上显示规范化原因，而不是原始 JSON。
4. **重试入口**：`retryLifeSegment`（已存在）补一个"不带人物参考重试"按钮选项（UI 仅在 `errorCode === "policy_real_person"` 时显示）。

UI 改动局限在 `AssetCard.tsx`（错误文案 + 可选重试按钮分支），不新增组件。

---

## 2. Chat Agent 真指令落库

**根因**：`src/routes/api/chat-stream.ts` 只产出文本流，不会回写 brief / script / 角色，所以"在 chatbox 改场景/人物"对生成结果无影响。

**改动**：

1. **服务端**（`chat-stream.ts`）：在系统提示里追加"指令协议"——模型必须在回答末尾输出 `<directives>...</directives>` JSON 块，schema：
   ```json
   { "patch": {
       "brief.prompt"?: string,
       "brief.adType"?: string,
       "brief.format"?: string,
       "script.mood"?: string,
       "script.shots"?: [...],
       "characters"?: [{ id, name?, look?, voiceName? }],
       "scenes"?: [{ id, name?, description? }]
     },
     "rerun"?: ("script"|"wardrobe"|"cast"|"paint")[]
   }
   ```
   服务端解析后通过新 SSE 事件 `directives` 推给客户端；正文里把 `<directives>` 块剥掉。

2. **客户端**（`ChatAgentMessage.tsx` + 新建 `src/lib/sc/agent-directives.ts`）：监听 `directives` 事件 → 调用 store 新增的 `applyAgentPatch(patch)`：浅合并 brief / script / 角色字段，必要时 `set({ assets: ... })` 标记受影响的 stage 为 `pending`，再按 `rerun` 数组顺序触发对应阶段 runner。每条 patch 在聊天气泡下方显示一张"已生效"摘要卡，用户可点"撤销"（恢复 snapshot）。

3. **store**（`store.ts`）：暴露 `applyAgentPatch / undoAgentPatch`；不破坏现有 stage 顺序。

---

## 3. 跨设备项目历史

**根因**：`enterProject` 只读 `taskHistory`（localStorage），换设备/清缓存就没了；任务内容也没持久化到后端。

**改动**：

1. **后端落库**：复用已有 `assets` / `video_tasks` 表 + 新增列 `video_tasks.snapshot jsonb`（保存 `stageSnapshots`、`script`、`brief`、`status`、`taskKind`、`projectId`、`assetsIndex`）。通过 migration 加列 + GRANT 已存在无需重新授权（同表）。
2. **新增 server fn**（`src/lib/tasks.functions.ts`）：
   - `upsertTaskSnapshot({ taskId, projectId, snapshot })`：受 `requireSupabaseAuth` 保护，写入 `video_tasks`。
   - `listProjectTasks({ projectId })`：返回该用户该项目下所有 task snapshot。
3. **store**：`persistCurrent` 在写本地后异步 fire-and-forget 调 `upsertTaskSnapshot`；`enterProject` 改为：先 `listProjectTasks` 拉远端，与本地 `taskHistory` 合并（远端为准、本地补全），再走原来的 restore 逻辑；若远端有本地没有的任务，写回本地缓存。

不改 UI 文案。

---

## 4. Boost speed 2000 积分上限 / 校验放宽（修本轮新出 bug）

**现象**：控制台持续刷 `cost Number must be less than or equal to 1000` —— 上轮把 Boost 接到 `consume(... 2000 ...)` 后，`credits.functions.ts` 的 zod schema 仍限 `max(1000)`，每次都被拒入库。

**改动**：

1. `src/lib/credits.functions.ts`：把 `cost` 上限放宽到 `max(20000)`（覆盖 Boost 2000、未来批量场景）。
2. `src/lib/sc/credits-store.ts`：后端失败时仅 console.warn 已做；额外在 toast 里只在「前端余额校验失败」时提示用户，后端校验失败不再骚扰用户。

---

## 涉及文件

- `src/lib/seedance.functions.ts`（错误归类）
- `src/lib/sc/store.ts`（runLife 降级重试、applyAgentPatch、enterProject 合并远端）
- `src/components/sc/AssetCard.tsx`（错误文案/重试按钮分支）
- `src/routes/api/chat-stream.ts`（directives 协议）
- `src/components/sc/ChatAgentMessage.tsx`（解析 directives + 撤销卡）
- `src/lib/sc/agent-directives.ts`（新建：patch → store 映射）
- `src/lib/tasks.functions.ts`（新建：upsertTaskSnapshot / listProjectTasks）
- `supabase` migration：`alter table public.video_tasks add column snapshot jsonb`
- `src/lib/credits.functions.ts`（cost max 20000）

不改：sidebar、QC、cast、voice library（上轮已完成）。

---

## 验收

1. 故意上传含真人脸的参考图 → 单段标"参考图疑似真人，已自动降级"，其余段继续；总段不再"全部失败"。
2. 在 chatbox 输入"把女主换成男主、场景改成雨夜地铁" → 出现"已生效"摘要卡 → cast/paint 自动 rerun，输出和指令一致；点"撤销"可回滚。
3. 浏览器 A 创建项目并跑完一个任务 → 浏览器 B 登录同账号进入该项目 → 能看到任务历史并可 restore。
4. 点 Boost speed → 控制台不再刷 cost 校验错误，余额 -2000，ledger 正常入库。
