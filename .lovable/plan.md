## 总览

针对 8 项反馈逐条修复，主要涉及：项目分类语义化、自动创建项目逻辑、剧本规划区 UI 顺序、素材预览/上传扩展、生成流程增加「角色与场景（带音色）」阶段、多余按钮清理。

---

## 1. 项目分类改为视频创作语义（图1）

**改动**：`src/lib/sc/projects-store.ts`、`src/components/sc/CreateProjectDialog.tsx`、`src/components/sc/ProjectGuideCard.tsx`

- `ProjectKind` 改为：`series`（连续剧）| `ad`（广告）| `education`（教育）| `mv`（MV）| `custom`
- `KIND_OPTIONS` 图标更新：
  - 连续剧 → `Clapperboard`（青色 `text-accent`）
  - 广告 → `Megaphone`（橙色 `text-amber-400`）
  - 教育 → `GraduationCap`（蓝色 `text-sky-400`）
  - MV → `Music2`（紫色 `text-violet-400`）
- 数据库 `projects.kind` 列的 check / 默认值同步：写迁移 `ALTER TABLE projects DROP CONSTRAINT ... ADD CONSTRAINT projects_kind_check CHECK (kind IN ('series','ad','education','mv','custom'))`，旧值 `writing/travel/...` 批量映射为 `custom`。

---

## 2. 输入「连续剧」时自动创建并入项目

**问题**：当前仅显示 `ProjectGuideCard` 引导，不会自动创建。

**改动**：`src/lib/sc/store.ts` 中 `submit()` 流程末尾 + `ProjectGuideCard.tsx`

- 在 `submit()` 检测到关键词（连续剧/系列/第X集/episode/series）且当前任务未关联项目时：
  - 若未登录 → 维持显示登录提示卡
  - 若已登录且 `projects` 列表中无同名项目 → 调用 `createProject({ name: taskTitle, kind: 'series' })` + `attachEpisode({ project_id, task_id, episode_no: 1 })`
  - 在 store 新增 `currentProjectId` 状态，Sidebar 高亮当前项目
- `ProjectGuideCard` 退化为「已自动归档到项目 X · 查看」的成功状态卡

---

## 3. 剧本规划选项卡置于剧本上方（图2）

**问题**：`ChatOptionCard`（chat-director 的 brief 细化问题）目前混在 `chatLog` 队尾，渲染在所有 stage 之下。

**改动**：`src/components/sc/Workspace.tsx`

- 在 `inFlow` 渲染内，将 `chatLog` 中 `status==='awaiting'` 且与 `structure` 阶段相关的 `optionCards` 消息**前置**渲染到 `SeriesBible` 之后、`STAGE_ORDER.map` 之前。
- 已回答的卡片仍按原顺序显示在底部聊天流，保持时间线感。

---

## 4. 图片素材新增放大预览

**改动**：新建 `src/components/sc/AssetPreviewDialog.tsx`、更新 `AssetCard.tsx`、`AssetThumbCard.tsx`、`AssetActions.tsx`

- 基于现有 `Dialog`，全屏遮罩居中显示 `<img>`（最大 90vw/90vh），含关闭按钮、键盘 ESC、版本切换箭头
- `AssetThumbCard` 双击 / `AssetActions` 新增 `ZoomIn` 按钮（hover 显示在右上）触发预览
- 视频复用同一组件，使用 `<video controls>`

---

## 5. 音色与角色素材同步出现

**改动**：`src/lib/sc/store.ts` runWardrobe 完成后

- 当 `wardrobeAssets` 中识别到 `W` 开头（角色）的 asset 时，自动为每个角色调用 `bindCharacterVoice`：默认绑定一个预设音色（性别启发：根据 caption 简单匹配「男/女/her/him」）
- `MediaRail` 在「图片」分类下，角色 asset 旁显示一个小的 `Volume2` 角标，hover 显示绑定的音色名；点击打开 `CharacterVoiceBinding` 面板

---

## 6. 上传素材未驱动剧情生成

**问题**：`brief.attachments` 在 `runScene/runStructure` 阶段未传递给 AI。

**改动**：`src/lib/script.functions.ts`、`src/lib/sc/store.ts`

- `generateScript` 的 prompt 模板新增 `attachments` 段：列出每个附件的 `name + kind + caption + url`，并明确要求 AI 「将以下用户素材作为剧情主线元素 / 主角形象 / 场景参考，禁止生成与之无关的品牌或角色」
- `runWardrobe` 中已有 `briefPrompt`，再额外注入「reference asset URLs」到 imagegen prompt 的 `reference_images` 字段（如果模型支持图像参考），否则在文字 prompt 中描述

---

## 7. 多素材类型上传支持（图片/视频/音频）

**改动**：`src/components/sc/AttachMenu.tsx`、`src/lib/upload-image.ts`

- `<input accept="image/*,video/*,audio/*">`
- 在 `AttachMenu` 增加 3 个分项菜单按钮：图片 / 视频 / 音频；音频上传完成后弹窗询问「设为角色音色？」→ 是 → 触发 `cloneVoice({ audio_url })`
- `upload-image.ts` 改名职责（保留向下兼容导出），支持任意 MIME 上传到同一 storage bucket，返回 `{ url, kind }`

---

## 8. 删除无效按钮（图3）

**改动**：`src/components/sc/AssetCard.tsx`

- 删除 `Replace` 按钮（无 handler）
- `Open` 改为打开新建的 `AssetPreviewDialog`（接 #4），保留按钮
- `Download` 已可用（`AssetActions` 内），从底部 toolbar 移除重复的下载图标按钮

---

## 9. 新增「角色与场景（带音色）」阶段，介于 wardrobe 与 paint 之间

**改动**：`src/lib/sc/types.ts`、`src/lib/sc/store.ts`、`src/components/sc/Workspace.tsx`、新建 `src/components/sc/CharacterScenePanel.tsx`

- `StageId` 插入 `'cast'`，`STAGE_ORDER` 变为：`scene → structure → wardrobe → cast → paint → qc → life → details`
- `STAGE_LABEL.cast = "Casting characters & scenes"`
- 新增 `runCast()`：
  - 输入：`wardrobeAssets` + `script.shots[*].scene`
  - 产出 `Asset[]`（`stageId='cast'`），命名 `C01..` 为角色合成图（带服装、表情参考），`S01..` 为场景概念图
  - 每个角色卡内联展示当前绑定的音色 + 试听按钮（复用 `CharacterVoiceBinding` 行组件）
- 完成后打开 `Gate = 'cast'`，用户确认后才 `runPaint()`
- `gate` 类型增加 `'cast'`，`ApprovalChips` 增加对应文案「角色与场景已就绪，继续生成关键帧？」

---

## 数据库迁移

```sql
-- 1) projects.kind 约束更新
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_kind_check;
UPDATE public.projects SET kind='custom'
  WHERE kind NOT IN ('series','ad','education','mv','custom');
ALTER TABLE public.projects
  ADD CONSTRAINT projects_kind_check
  CHECK (kind IN ('series','ad','education','mv','custom'));
ALTER TABLE public.projects ALTER COLUMN kind SET DEFAULT 'custom';
```

`voices.functions.ts` 与 `characters.functions.ts` 已具备，复用即可。

---

## 验证清单

1. 项目对话框显示「连续剧/广告/教育/MV」四个分类，图标语义正确
2. 输入「制作连续剧第一集」并回车 → 自动登录态下创建项目并归档，Sidebar 出现新项目
3. chat-director 卡片始终在 ScriptTable 上方
4. 图片素材右上角出现 `🔍` 图标，点击 / 双击弹出全屏预览，支持版本切换
5. wardrobe 完成后每个角色 asset 自动绑定一个预设音色，`MediaRail` 显示音色角标
6. 上传素材 + 输入剧本要求 → 生成的 script 与 wardrobe 引用素材内容
7. `AttachMenu` 支持图片/视频/音频上传；音频上传完询问克隆为音色
8. `AssetCard` 不再显示 Replace 按钮，Open 触发预览
9. 新阶段 `cast` 出现在 wardrobe 之后、paint 之前，含确认 gate
