## 剩余实现计划（续上轮）

数据库与服务端函数（projects / voices / character_voices / assets 版本字段）已完成，VoiceLibraryPanel、CreateProjectDialog、ProjectGuideCard、projects-store、voices-store 已落地。本轮收尾以下 5 件事，全部前端 + 接线，不改数据库。

---

### 1. Sidebar 项目列表渲染（真实后端）

文件：`src/components/sc/Sidebar.tsx`

- 在「任务历史」上方新增「我的项目」分组：
  - 头部：`我的项目` + `+` 图标按钮 → `useProjects().openCreate()`
  - 列表：`useProjects().projects` 渲染为可点击行，左侧 emoji（icon 字段）+ 项目名 + 集数 badge
  - 三态：loading（3 行 skeleton）/ empty（"还没有项目" 提示 + 创建按钮）/ ready
- 未登录用户：显示「登录后管理项目」占位 + 跳转 `/login` 链接
- 在根组件挂载 `useProjects().fetchProjects()`（仅登录时）

### 2. MediaRail 三分类筛选

文件：`src/components/sc/MediaRail.tsx`（查看现有结构后改）

- 把原本 wardrobe/keyframe/video/fix-history 5 个 chip 改成 3 个：`图片 / 视频 / 音频`
- 映射逻辑：
  - 图片：`asset.kind === 'image'` 或 `media_kind === 'image'`
  - 视频：`asset.kind === 'video'` 或 `media_kind === 'video'`
  - 音频：`media_kind === 'audio'`（含 TTS 生成片段、上传音频）
- 「修改版本」不再单独成 tab，改为在原图卡片上叠加版本切换器（见第 3 项）
- chip 三态：default / hover / active；选中时显示计数 badge

### 3. AssetCard / AssetThumbCard 版本切换器

文件：`src/components/sc/AssetCard.tsx`、`src/components/sc/AssetThumbCard.tsx`

当前已有 `openVersionDrawer` 按钮，按用户偏好改为**就地切换**：

- 用 `parent_asset_id` 聚合：父资产合并所有子版本到 `versions[]`
- 卡片右下角叠加：
  - ≤3 版本：圆点指示器（点亮 = 当前展示）+ 左右切换箭头（hover 显示）
  - >3 版本：显示 `v2/5` 数字 badge + 左右箭头
- 切换时只换 `url`/`poster`，标签栏显示 `v{n}` + 来源（qc-fix / manual-edit 等）小 chip
- 完整三态：默认（只显示当前版本）/ hover（出现箭头）/ active（点亮当前圆点）
- 保留旧 VersionDrawer 作为「查看全部版本」入口（双击或右键菜单触发）

新增 store 动作（`src/lib/sc/store.ts`）：`setActiveVersion(assetId, versionIndex)`

### 4. 角色音色绑定 UI

文件：新建 `src/components/sc/CharacterVoiceBinding.tsx`，挂载在 VoiceLibraryPanel 底部 + 剧本/角色卡侧边

- 列出当前 task 的角色（从 `script` 中提取 character 列表）
- 每个角色一行：角色名 + 「选择音色」下拉（从 `useVoices().voices` 选）+ 试听按钮
- 绑定写入 `character_voices` 表，需要新增服务端函数 `src/lib/characters.functions.ts`：
  - `listCharacterVoices({ task_id })`
  - `bindCharacterVoice({ task_id, project_id?, character_name, voice_id })`
  - `unbindCharacterVoice({ id })`
- 三态：空（"未绑定，点击选择音色"）/ 绑定中 loading / 已绑定（显示音色头像 + 解绑 ×）

### 5. 登录态接入 + ProjectGuideCard 真实触发

- `src/components/sc/Workspace.tsx`：
  - 接入 `supabase.auth.getUser()`，未登录时 ProjectGuideCard 显示「登录后保存项目」按钮 → `/login`
  - ProjectGuideCard 触发条件：用户输入命中正则 `/第\s*\d+\s*[集话]|下一集|系列|剧本/` 或上传 `.txt/.md/.fountain` 文件
  - 触发后调用 `useProjects().openCreate({ name: 推断的项目名 })`
- 在 `src/routes/__root.tsx` 添加 `onAuthStateChange` 监听，登录后 `fetchProjects()`

---

### 技术细节

- 所有新 UI 使用 `src/styles.css` semantic tokens（surface-2, border, accent 等），禁止裸 hex
- 圆角统一 `rounded-xl`（12px），chip 间距 `gap-2`（8px）
- 版本切换器箭头用 `lucide-react` 的 `ChevronLeft/Right`
- 服务端函数全部使用 `requireSupabaseAuth` 中间件，遵循 `server-side-modern`
- 不再触碰 `client.ts` / `types.ts` / `routeTree.gen.ts`

---

### 验证步骤

1. 构建通过（自动）
2. 未登录访问首页：sidebar 显示登录占位，ProjectGuideCard 显示登录按钮
3. 登录后输入「制作第一集」→ ProjectGuideCard 出现 → 点击创建项目 → sidebar 出现新项目
4. 上传素材后 MediaRail 三分类正确切换
5. 资产被 QC 修复后，原卡片出现版本切换器，可前后切换

是否批准？批准后我会一次性写所有文件。
