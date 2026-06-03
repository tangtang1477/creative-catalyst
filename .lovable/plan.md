
# 七项修复与重构计划

## 1. 账户余额三处显示不一致

**现象**：HoverCard 顶部进度条颜色是黄色（旧的 `to-status-ready` 渐变）+ 余额面板显示 44 积分（4/20 圆点）+ 侧栏底部头像 tooltip 仍显示 "200 积分"。

**根因**：
- 侧栏底部 `CreditRing` 的 `title` 没有重新订阅（或 zustand 选择器在 SSR hydrate 时拿了初值），且头像内层用了 `bg-gradient-to-br from-status-ready to-accent` 让整圈看起来是绿色。
- HoverCard 顶部那条 `h-[3px]` 进度条在视觉上和 CreditRing 颜色不统一（截图里偏黄）。

**修复**：
- `UserHoverCard.tsx`：把头像内层渐变从 `from-status-ready to-accent` 改为单色 `bg-accent`（与圆环同色系），顶部 `h-[3px]` 进度条直接用 `var(--accent)`/`--credit-low`/`--credit-critical` 三段色，统一到 `creditsSelectors.ringPercent`。
- `CreditRing.tsx`：title 加 `suppressHydrationWarning`，并改用 `useSyncExternalStore` 友好写法（直接 `useCredits((s) => Math.max(0, s.total - s.used))`，已是，但确认底部 sidebar collapsed 状态下也强制 re-render）。检查侧栏底部那个 CreditRing 是否被 `React.memo` 包裹导致不更新。
- 确认三处单一数据源：`remaining = total - used`，全部展示 `remaining` 同一个值。

## 2. 项目删除功能

- `projects-store.ts` 新增 `removeProject(id)`：从 list 删除、清掉 `currentProjectId`（若匹配）、删除关联 tasks 中的 `projectId` 标记。
- `Sidebar.tsx` 项目行 hover 出现垃圾桶按钮（参考现有任务行的删除样式），点击弹 `AlertDialog` 二次确认。
- 后端 `projects.functions.ts` 增加 `deleteProject` server fn，软删除或硬删 `public.projects` 行（RLS 限 owner）。

## 3. 参考图功能

- 输入区 `AttachMenu` / `AttachmentChips` 已支持图片上传。新增 **"作为参考图"** 标记：附件 chip 增加 `role: "reference" | "asset"` 切换。
- 在 wardrobe / characters / scene / keyframe 各 stage 的图片生成调用里，把当前任务的 reference 图作为 `reference_images: string[]` 透传给 `image-edit.functions.ts`（已有 edit 通路，扩展为 reference-conditioned 生成；Gemini `gemini-3-pro-image-preview` 支持多图输入作 reference）。
- 生成 prompt 自动追加："严格参考用户提供的参考图风格 / 服装 / 道具 / 角色外貌"。

## 4. Wardrobe 阶段产出真正的"服化道"而非关键帧

- 重写 wardrobe 生成 prompt 模板：强制 **白底产品图 / 平铺 flat-lay**，主体居中，无人物、无场景、无叙事画面。
- prompt 模板示例：`"Studio product photography of [item], plain white background, no human, no environment, centered, soft even lighting, high detail, e-commerce style"`。
- 负面提示词："no person, no character, no scene, no background story, no cinematic shot, no keyframe"。
- 容器固定 1:1（产品图标准）。

## 5. 人物素材自动匹配 ElevenLabs 音色

- `characters.functions.ts` 在 `generateCharacter` 完成后调用 `voices.functions.ts` 的 `suggestVoice({ gender, age, personality, language })`，从 ElevenLabs voice library 拉一个匹配音色，写入 `character_voices` 表。
- `CharacterVoiceBinding.tsx` 在角色卡片生成完毕即展示已绑定音色 + 试听按钮（调用现有 TTS 通路）。
- 用户可在 `VoiceLibraryPanel` 中替换。

## 6. 重构生成流水线顺序

**新顺序**：
```text
脚本+分镜文本 → ① Wardrobe (服化道产品图)
              → 用户确认
              → ② Characters (人物素材，匹配音色) + Scenes (场景素材)
              → 用户确认
              → ③ Keyframes (基于人物+场景+服化道生成)
              → ④ AI QC (一致性 / 服装 / 镜头检测)
                  - 通过 → 进入 ⑤
                  - 不通过 → 展示问题清单 + 重新生成按钮 / 手动编辑
              → ⑤ Storyboard (按 keyframe 排序成分镜)
              → ⑥ 视频合成确认（用户勾选要合并的分镜 → "生成完整视频"）
```

- `store.ts` stage 枚举调整：`wardrobe → characters → scenes → keyframes → qc → storyboard → final_video`（characters 与 scenes 合并为同一并行阶段或拆双 substage）。
- `StageRow.tsx` / `Workspace.tsx` 按新顺序渲染。
- `QualityCheck.tsx` / `QCPanel.tsx`：QC 完成后总是显示结果（不论通过/未通过），包含一致性评分、问题清单（截图+标注），通过项也展示 ✅ 绿勾，未通过项展示 ⚠️ + "重新生成此帧" CTA。
- 新增"合成视频"步骤：列出所有 keyframe + 对应分镜短视频，用户勾选后调用 `video-tasks.functions.ts` 串联输出。

## 7. 素材容器按真实宽高比匹配

- `AssetCard.tsx` / `AssetThumbCard.tsx` / `MediaRail.tsx` / `AssetPreviewDialog.tsx` 统一通过 `asset.aspectRatio` 字段渲染容器：
  ```text
  支持: 16:9 | 9:16 | 1:1 | 3:4 | 4:3
  ```
- `types.ts` 给 `Asset` 加 `aspectRatio: "16:9" | "9:16" | "1:1" | "3:4" | "4:3"`，生成时根据 stage 默认值（wardrobe=1:1, character=3:4, scene=16:9, keyframe=用户选择, video=用户选择）。
- 移除 AssetCard.tsx 里第 148/161/173/180 行的硬编码 `9/16` 和 `16/9`，改为 `style={{ aspectRatio: asset.aspectRatio.replace(":", " / ") }}`。
- 视频播放器同样按真实宽高渲染，不强制横版。

---

## 涉及文件

**积分**：`src/components/sc/UserHoverCard.tsx`, `src/components/sc/credits/CreditRing.tsx`
**项目删除**：`src/lib/sc/projects-store.ts`, `src/lib/projects.functions.ts`, `src/components/sc/Sidebar.tsx`, 新建迁移
**参考图**：`src/components/sc/AttachMenu.tsx`, `src/components/sc/AttachmentChips.tsx`, `src/lib/image-edit.functions.ts`, `src/lib/sc/store.ts`
**Wardrobe**：`src/lib/characters.functions.ts` 或对应 wardrobe 生成入口、prompt 模板
**音色**：`src/lib/characters.functions.ts`, `src/lib/voices.functions.ts`, `src/lib/sc/character-voices-store.ts`, `src/components/sc/CharacterVoiceBinding.tsx`
**流水线**：`src/lib/sc/store.ts`, `src/lib/sc/types.ts`, `src/components/sc/Workspace.tsx`, `src/components/sc/StageRow.tsx`, `src/components/sc/QCPanel.tsx`, `src/components/sc/QualityCheck.tsx`
**宽高比**：`src/lib/sc/types.ts`, `src/components/sc/AssetCard.tsx`, `src/components/sc/AssetThumbCard.tsx`, `src/components/sc/MediaRail.tsx`, `src/components/sc/AssetPreviewDialog.tsx`

## 实施顺序建议

由于 7 项跨度很大，建议按以下顺序，每完成一组提交一次便于回滚：
1. 积分一致性（最快，纯前端）
2. 宽高比容器（纯前端）
3. 项目删除（前端 + 一个迁移）
4. 参考图传参
5. Wardrobe prompt 修正
6. 音色自动匹配
7. 流水线重排 + QC 展示 + 视频合成确认（最大改动）

请确认或调整后我开始实施。
