# 流水线重构方案

## 新流程顺序

```
scene/structure（已有，剧本规划）
  ↓
wardrobe   服化道（仅服装 + 道具，已是平铺式）
  ↓ 用户确认
cast       人物 & 场景素材（新增阶段，同步绑定音色）
  ↓ 用户确认
paint      关键帧（基于 wardrobe + cast 参考）
  ↓
qc         AI 一致性检测（始终展示六项结果与通过/未通过，非仅失败时）
  ↓ 用户确认
life       分镜视频片段（每个关键帧 → 一段视频）
  ↓ 用户确认「合成完整成片」
details    合成 & 交付
```

## 改动清单

### 1. `src/lib/sc/types.ts`
- `StageId` 增加 `"cast"`
- `STAGE_ORDER` 改为 `["scene","structure","wardrobe","cast","paint","qc","life","details"]`
- `STAGE_LABEL` 更新中文/英文标签匹配新语义：
  - wardrobe → "服化道（服装 & 道具）"
  - cast → "人物 & 场景素材"
  - paint → "关键帧"
  - qc → "AI 一致性检测"
  - life → "分镜视频片段"
  - details → "合成完整成片"
- `Gate` 增加 `"cast"` 与 `"merge"`

### 2. `src/lib/sc/store.ts`
- 新增 `runCast()`：基于剧本 characters/scenes 字段（缺省 2 角色 + 2 场景）生成 C01/C02/S01/S02 资源；3:4 / 16:9 容器。
- 把现有 `wardrobe` 末尾的 **音色自动绑定** 逻辑迁移到 `runCast()` 末尾（这一步才出现角色）。
- `runWardrobe` 完成 → `openGate("wardrobe", () => runCast())`
- `runCast` 完成 → `openGate("cast", () => runPaint())`
- `runPaint` 参考来源同时包含 `wardrobe` 与 `cast` 的资产 URL
- `runLife` 完成 → `openGate("merge", () => runDetails())`（最终合成由用户确认）
- `details` 阶段改为"合成成片"，输出合并后的最终视频条目（占位 / 真合并视后续）
- `initialStages()` 自动覆盖 cast

### 3. `src/components/sc/StageRow.tsx`
- `stageIcon` / `thinkingVerb` 补 `cast`（图标用 `Users`）

### 4. `src/components/sc/QCPanel.tsx`
- 改为：QC 完成（`ready`）后仍渲染六项；每项根据 `stage.thoughts`/`summary` 中记录的失败维度展示 ✓ 或 ✗（红色），并附简短说明。
- 进度条改为"已检 X / 6"，完成时显示 100%。

### 5. `src/components/sc/Workspace.tsx`
- 在 `STAGE_ORDER.map` 中处理 `cast`：渲染网格展示 C* / S* 资产。
- `details` 阶段总是渲染合成视频卡而非 QualityCheck（仅当 ready 显示一段最终视频；recovering/running 显示进度）。

### 6. `src/components/sc/ApprovalChips.tsx`
- 增加 `cast` 与 `merge` 两种 gate 文案：
  - cast：「确认人物/场景，开始生成关键帧」
  - merge：「确认合成完整成片」

### 7. 其他被动适配
- `Sidebar.tsx` 进度环 / 任务历史中遇到 cast 不再报错
- 历史回放（taskHistory）字段已用 `Partial<Record<StageId,…>>`，无需迁移；旧记录缺 cast 字段自动留空。

## 不在本轮改动

- 真正调用云端合成视频接口（先用前端占位条目 + 用户确认 UX）。这部分在合成 API 接好后再接线。
- 取消 details 中的 QualityCheck UI（移到 QC 阶段统一展示）。

## 文件
`types.ts`, `store.ts`, `StageRow.tsx`, `QCPanel.tsx`, `Workspace.tsx`, `ApprovalChips.tsx`
