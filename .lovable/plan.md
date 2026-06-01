# 修复四个收尾问题

## 1. Wardrobe（服装/道具）阶段不再用假图
**现状**：`store.ts` runWardrobe 里 W01/W02/P01 三张全部硬塞 `SAMPLE_KEYFRAME`（香水那张），所以无论用户主题是什么，前面 3 张都长一样。
**改法**：和 Paint 阶段一致，走真实 `streamGenerateImage`：
- 根据 `script.wardrobe[i].caption` + `brief.prompt` 生成英文 prompt（W01 主角形象 / W02 配角 / P01 关键道具，主体必须是用户主题里的对象）
- 串行生成，`onPartial` 给 data URL 做模糊预览，完成后 `uploadBase64Image` 拿 https URL
- 失败走和 Paint 一样的 Failed 流程
- 未登录回退仍可保留 SAMPLE_KEYFRAME（仅 fallback）

## 2. Loading 样式去掉两个半圆线圈
**现状**：`GradientLoader.tsx` 中央有两个反向旋转的环（你截图里那两个蓝色半圆）。
**改法**：移除 `Dual counter-rotating rings` 整块 div，只保留蓝色 aurora 渐变 + 横向 shimmer 扫光 + 底部 label。让 loading 看起来是「整图在流式渲染」而不是 spinner。

## 3. QC 修正后角色仍不一致
**根因**：`applyQCFixInternal` 用纯 text-to-image (`streamGenerateImage`) 重生成，没有把 W01/W02/P01 参考图喂进去，所以模型每次都重新想象角色 → 自然飘。
**改法**：把"修正"从 text-to-image 升级到 image-edit + 多参考图：
- 新增 server fn `src/lib/image-edit.functions.ts`，调用 `google/gemini-3.1-flash-image-preview`（聊天 multimodal shape），messages 里依次塞入：W01/W02/P01 图 URL（角色/道具锁），原始失败镜头的 URL（构图锁），+ `issue.fixPrompt` + `brief.prompt`
- `applyQCFixInternal` 改成调这个新 fn，拿 b64 → `uploadBase64Image` → `updateAsset(shotId, { url })`
- 同时把首轮 Paint 也可选地用 image-edit（W01-P01 作为 ref）保证一开始就一致；本次只做 QC 修正路径，避免改动面过大

## 4. 生成失败 UI 重做 + 真实错误原因 + 不扣积分提示
**现状**：`AssetCard.tsx` 失败态只有"生成失败 + 重试"两行红字；`Asset` 类型没有 `error` 字段；store 把错误信息只塞进 stage summary。
**改法**：
- `types.ts` 给 `Asset` 加 `errorMessage?: string`、`errorCode?: string`
- store 里所有 `updateAsset(id, { status: "Failed" })` 同时写入 `errorMessage`（`(e as Error).message` 或 seedance 失败原因 / 轮询超时文案）；并且**失败时不调用 `consume()`**（当前实现已经如此，仅需在 UI 上明示"未扣积分"）
- `AssetCard.tsx` 失败态换成卡片化设计：
  - 顶部一个柔和红色 icon + "生成失败"标题
  - 下方一行细字显示 `asset.errorMessage`（截断 2 行）
  - 一行绿色小标"本次未扣除积分"
  - 底部一排按钮：重试（主） / 查看详情（hover 显示完整错误 tooltip）
  - 整体用 `bg-surface-2/60` + `border-status-failed/30` 而不是大红字
- 同步在 GradientLoader 旁边失败回退也用这套样式

## 技术清单
- 编辑 `src/lib/sc/store.ts`：runWardrobe 改真实生图；applyQCFixInternal 改 image-edit；所有 Failed 分支带上 errorMessage
- 新建 `src/lib/image-edit.functions.ts`（multimodal Gemini edit，server fn）
- 编辑 `src/lib/sc/types.ts`：Asset 增加 `errorMessage`/`errorCode`
- 编辑 `src/components/sc/GradientLoader.tsx`：删两个旋转环
- 编辑 `src/components/sc/AssetCard.tsx`：失败态新样式 + "未扣积分"提示
- 跑构建验证

确认后我会按顺序执行。
