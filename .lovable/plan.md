## 目标

1. AssetCard 角色卡上的音色 pill 调整样式，并在 pill 里增加快捷"试听"键；下拉菜单变窄一些。
2. Gallery（MediaRail）当 filter=audio 时显示两个 Tab：
   - **当前任务音频**：现有的音频 asset 列表（保持原有 AssetCard 列表渲染）。
   - **音色库**：图文卡片网格，每个音色对应 1:1 虚拟形象图片 + 名称 + 试听按钮。

仅前端 UI 调整，不动后端业务逻辑。

---

## 1. 音色 pill 与下拉框（src/components/sc/AssetCard.tsx）

Pill（DropdownMenuTrigger）样式：
- 高度由 `h-6` 提到 `h-7`，圆角统一为 `rounded-full`，背景 `bg-surface-2/70 hover:bg-surface-2`，外层加 `border border-border/60`。
- 内部布局：`[Mic 图标] [名称] [▶/⏸ 小按钮（试听当前绑定音色）] [ChevronDown]`，名称用 `max-w-[88px] truncate`。
- 新增的内嵌"试听"按钮独立 `<button>`，`onClick` 调 `e.stopPropagation()` + `e.preventDefault()`，避免触发 Trigger 打开下拉；播放/停止逻辑复用现有 `previewVoice / stopPreview / previewingId`。

DropdownMenuContent：
- 宽度从 `w-60` 减到 `w-44`，`text-[11px]`，item 内部图标统一 `h-2.5 w-2.5`，整体更紧凑。
- 内部每项的试听按钮保留现有 `Play/Pause`，不变。

无其他逻辑改动；自动匹配音色 / 切换音色逻辑不动。

---

## 2. Gallery 音频区 Tabs（src/components/sc/MediaRail.tsx）

在现有 `filter === "audio"` 渲染路径上方插入两个 Tab：
- 默认 Tab："**任务音频**"（视图 = 当前 audios 列表，沿用 grid/list 渲染）。
- 第二 Tab："**音色库**"（视图 = `<VoiceLibraryGrid />` 新组件）。

实现：新增本地 state `audioTab: "task" | "library"`，渲染条件 `filter === "audio"` 时优先展示一行 segmented Tabs（pill 风格，复用 filter chips 视觉），然后根据 tab 切换内容。其余 filter 路径不受影响。

---

## 3. 新组件 `VoiceLibraryGrid`（新文件 src/components/sc/VoiceLibraryGrid.tsx）

数据源：复用 `useVoices()`（已经存在的 voices-store），自动 `fetchVoices()`，状态过滤 `status === "ready"`。

布局：`grid grid-cols-2 gap-2`，每个卡片：
- 顶部 1:1 头像（`aspect-square rounded-xl overflow-hidden`），通过 `voiceAvatar(voice)` 解析：
  - 预设音色（source=preset）→ 用预生成的 12 张图片资源，按 `name` 映射；
  - 克隆音色（source=cloned）→ fallback 渐变背景 + 首字母大写居中显示。
- 中部：`voice.name`（粗体）+ 角标（预设 / 我的）。
- 底部：圆形 ▶/⏸ 试听按钮，状态对接 `previewingId`。

复用现有 `preview / stopPreview`，无新增 server 调用。

### 头像资源

在 `src/assets/voices/` 下用 `imagegen` 生成 12 张 512×512 1:1 头像（与 12 个预设音色一一对应：Alice/Brian/Callum/Charlie/George/Jessica/Laura/Liam/Lily/Matilda/River/Sarah），写一个 `voice-avatars.ts` 做 `Record<voiceName, importedAssetUrl>` 映射；克隆音色直接走 fallback。风格统一：极简插画 / 柔和渐变背景 / 半身人像，与产品深色 UI 协调。

---

## 4. 其余不动

- `VoiceLibraryPanel`、`CharacterVoiceBinding`、`voices-store`、`characters.functions.ts`、其它路由与状态均不修改。
- 自动绑定默认音色、绑定切换逻辑保持上一次实现。

---

## 文件清单

新增：
- src/components/sc/VoiceLibraryGrid.tsx
- src/components/sc/voice-avatars.ts
- src/assets/voices/{alice,brian,callum,charlie,george,jessica,laura,liam,lily,matilda,river,sarah}.jpg（imagegen 生成）

修改：
- src/components/sc/AssetCard.tsx（pill 样式 + 内嵌试听键 + 下拉宽度）
- src/components/sc/MediaRail.tsx（audio 过滤下加 Tabs + 引用新组件）
