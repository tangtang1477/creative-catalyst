## 1. 分镜（life 阶段）支持单镜生成

### 现状
`runLife()` 现在在进入 life 阶段时把全部分镜段一次性 `Promise.all` 提交 WAN，没有给用户"先生成 1 个看看 / 还是全部一把梭"的选择，结束后也直接 `openGate("merge", runDetails)`，没有"继续下一个分镜"的入口。

### 改造点
所有改动都在 `src/lib/sc/store.ts`、`src/lib/sc/types.ts`、`src/components/sc/ApprovalChips.tsx`，不动其他模块。

#### A. 进入 life 前新增 gate：让用户选 1 个 / 全部
- `types.ts` 的 `Gate` 联合类型加 `"life-scope"` 和 `"life-continue"`。
- QC 完成后原来直接 `schedule(() => runLife(), 1100)` 的三个调用点（≈1688/1736/1759/1852）改成 `openGate("life-scope", () => runLife({ mode: "all" }))`。
- `runLife` 改签名：`runLife({ mode: "single" | "all", startIndex?: number })`。
  - `mode === "single"`：只把 segments 的 `[startIndex]` 这一段加入 `segAssets` 并提交 WAN，其它段保留为未排队（不预插）。
  - `mode === "all"`：保留现有行为（一次性插入并并行提交）。
  - 成本扣减只按本次实际提交的段数算。
- ApprovalChips 新增变体 `"life-scope"`：
  - tip：`已规划 N 段分镜，先生成第 1 段试看，还是一次全部生成？`
  - 主按钮 `全部生成` → `approveLifeAll()`
  - 次按钮 `先生成 1 段` → `approveLifeOne()`
  - store 暴露 `approveLifeAll = () => { closeGate(); runLife({ mode:"all" }) }` 和 `approveLifeOne = () => { closeGate(); runLife({ mode:"single", startIndex:0 }) }`

#### B. 单段完成后的 gate：继续/全部继续/暂停
- 在 `runLife({ mode:"single" })` 的成功收尾分支（≈2129 行 `okCount === segAssets.length` 处）判断：
  - 若仍有剩余 segment（`producedCount < totalPlanned`）→ `openGate("life-continue", () => runLife({ mode:"all", startIndex: producedCount }))`；
  - 已生成全部 → 走原来的 `openGate("merge", runDetails)` 路径。
- 把"已规划总段数 / 已生成段数"塞进 store 新字段 `lifePlan: { total: number; produced: number } | null`，gate 文案可读到进度。
- ApprovalChips 新增变体 `"life-continue"`：
  - tip：`已生成 ${produced}/${total} 段，是否继续？`
  - 主按钮 `生成下一段` → `continueNextSegment()`
  - 次按钮 `生成剩余全部` → `continueAllSegments()`
  - 额外第三个 chip `暂停 · 去合成 / 退出` → `pauseLife()`：直接 `openGate("merge", runDetails)`（剩余段可后续手动 `runLifeSegment` 补）。
- store 暴露三个 action 对应上面三个按钮，都调用同一个 `runLife({ mode, startIndex })` 入口。

#### C. 失败/部分失败保持原有逻辑不变
现有"单段重试 `runLifeSegment`"不动；本次只是把"批量入口"参数化。

---

## 2. 任务音频面板（对白/旁白/BGM）目前永远是 0

### 根因
`runDetails()`（store.ts ≈2496）当前只是流式打印 4 行假 QC 文案，**完全没有调用 TTS**，所以 `assets` 里没有任何 `kind: "audio"` 资产，`MediaRail` 的 `TaskAudioPanel` 自然就显示 `暂未生成`。`character_voices` 表的绑定也没被消费。

### 改造点（只动 `runDetails` 和它依赖的几个文件）
1. **新增 server fn** `synthesizeDialogue` 放在 `src/lib/voices.functions.ts`：
   - 入参 `{ voice_id, text, label }`，复用现有 `previewVoice` 的 ElevenLabs 调用路径，返回 `{ audioBase64, mime }`。
2. **新增上传辅助** `uploadBase64Audio({ base64, mime, userId, taskId, filename })`，参考 `uploadBase64Image`：上传到同一个 storage bucket，返回 public URL；新文件路径 `src/lib/upload-audio.ts`。
3. **重写 `runDetails`**（保留原 4 行 QC 打印作为开场）：
   - 拉取 `script.shots`，从每个 shot 抽 `dialogue`（按角色）/`narration`。
   - 调 `listCharacterVoices({ data: { task_id } })` 拿到角色 → voice 绑定，没绑定的角色用一个默认 voice（取 `voices` 表 source=preset 第一条）。
   - 顺序遍历对白/旁白：
     - 调 `synthesizeDialogue`，再 `uploadBase64Audio`；
     - `set` 一条 `kind:"audio"` 的 Asset：
       - 对白 → `{ id:"D0X", label:"D0X", caption:"<character> · <shotId>", stageId:"details" }`
       - 旁白 → `{ id:"N0X", label:"N0X", caption:"旁白 · <shotId>", stageId:"details" }`
     - `MediaRail.TaskAudioPanel` 的 `classify` 已按 label/caption 字符串匹配 narration/旁白/bgm，因此 caption 带 `旁白` 即落入"旁白"分栏；其它入"对白"分栏，符合用户截图里的三栏布局，不必改 UI。
   - BGM：本次不做生成，只在 caption 不命中时保持现状（保留"暂未生成"提示），不动 BGM 分栏。
4. 完成后维持原来 `set({ phase:"done" })` / `consume / persistCurrent("done")` 收尾。

### 不改的地方
- `MediaRail.tsx`、`TaskAudioPanel` 不动（已经能按 asset 分组渲染）。
- `character_voices` 表结构 / `voices` 表 / 现有 voice 库 UI 都不动。
- `CharacterVoiceBinding` 已经能把角色 ↔ 音色绑定写入 DB，本次新逻辑只是消费它。

---

## 技术细节

```text
Gate 流程：
... → qc ready ──┐
                 ▼
        openGate("life-scope")        ← 新
        ┌──────────┬───────────┐
        ▼          ▼
   approveLifeAll  approveLifeOne
        │                │
        ▼                ▼
 runLife({mode:"all"})  runLife({mode:"single", i:0})
        │                │
        │                ▼
        │       openGate("life-continue")     ← 新（每段完成后）
        │       ┌────────┬────────┬────────┐
        │       ▼        ▼        ▼
        │   nextOne   allRest   pauseLife
        │
        ▼
   openGate("merge") → runDetails()
                          │
                          ▼
                   TTS 对白/旁白 → audio assets 写入 task
                          │
                          ▼
                   phase: "done"
```

文件清单（仅这些）：
- `src/lib/sc/types.ts` — `Gate` 加 `"life-scope" | "life-continue"`；可选给 `StageState` 不动。
- `src/lib/sc/store.ts` — `runLife` 参数化；新增 `lifePlan` 字段和 `approveLifeAll/approveLifeOne/continueNextSegment/continueAllSegments/pauseLife` 五个 action；改 `runDetails` 走 TTS。
- `src/components/sc/ApprovalChips.tsx` — `variants` 增加 `life-scope`、`life-continue` 两个分支（life-continue 支持第三个 chip）。
- `src/lib/voices.functions.ts` — 新增 `synthesizeDialogue` server fn。
- `src/lib/upload-audio.ts` — 新增（参考 `upload-image.ts`）。

风险/边界：
- 单镜生成中途，用户在 sidebar 切到别的 task 会触发现有的 `runId` 守卫，不会污染；新 action 沿用同一守卫。
- 没有绑定音色的角色 → 默认 preset voice，避免阻塞；UI 不报错，只在 summary 里追加一条 `${role} 未绑定音色，已使用默认 voice`。
- TTS 失败的单条 → 写一条 `status:"Failed"` 的 audio asset 但不影响整体 phase=done。
