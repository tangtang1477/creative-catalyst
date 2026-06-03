# 素材卡片（AssetCard）布局重构

针对图示的角色素材卡（W01 Laura）做四件事：解决 hover 冲突、默认自动匹配音色、删除底部音色行、把音色控件收成与下载键并排的 pill，并让试听按钮出现在下拉选项里。

## 1. 修复左上角按钮重叠

- 删除 `AssetCard.tsx` 左上角的"音色 badge + 试听小按钮"整块（约第 138-160 行的 `isCharacter && boundVoice && (...)`）。
- 这样 `AssetActions` 的多选 checkbox / hover 工具按钮就不再与音色按钮重叠。
- `AssetThumbCard` 不涉及音色，无需改动。

## 2. 默认自动匹配一个音色（无需用户先选）

在 `AssetCard.tsx` 中新增"自动绑定"副作用：

- 仅当 `isCharacter && voicesLoaded && cvLoaded && !binding && voices.length > 0` 时触发一次。
- 选择规则（按优先级）：
  1. `voices.filter(v => v.status === "ready")` 中按角色名做轻量匹配——若 `characterName` 含"女/Laura/姐/母/妻"等女性关键词，优先 `lang` 一致且名称含"女/Female"的预设；男性同理。
  2. 否则取 `source === "preset"` 且 `status === "ready"` 的第一个。
  3. 用素材 id 哈希（`hash(asset.id) % candidates.length`）做稳定选择，避免每张卡都选同一个。
- 命中后调用 `bindCharacterVoice({ character_name, voice_id })` + `cvRefresh()`；失败静默 `console.warn`。
- 用 `useRef` 防止重复绑定（StrictMode 双调用 / 重渲染）。

> 这样进入卡片就已经显示一个默认音色，用户只在想换时才打开下拉。

## 3. 删除卡片底部音色行 + 收成下载键旁的 pill

**删除：** `AssetCard.tsx` 底部 `{isCharacter && (<div className="...border-t...">...select+试听...</div>)}` 整块。

**新增：** 把音色控件做成一个紧凑 pill，插入到现有"预览 / v2 / 下载"按钮行（`<div className="flex items-center gap-1 pt-1">`）的**下载键右侧**：

```
[🔍 预览] [v2] [⬇ 下载] [🎙 预设·Laura ▾]
```

Pill 结构（仅 `isCharacter` 时渲染）：

- 触发器：使用 shadcn `DropdownMenu`（项目已用），按钮 `h-6 px-2 rounded-md bg-surface-2 hover:bg-surface-2/80 text-[11px]`，左侧 `Mic` 图标，中间截断显示 `boundVoice?.name ?? "选择音色"`，右侧 `ChevronDown`。
- 整张卡因此少一行 + 不再有底部 border，视觉上自然变窄/更紧凑。

**下拉项（DropdownMenuItem）布局：**

```
[预设·Laura .................] [▶/⏸]
[预设·Sora ..................] [▶/⏸]
[我的·克隆音1 ...............] [▶/⏸]
```

- 每项右侧带一个独立的 ▶/⏸ 按钮，`onClick` 时 `e.stopPropagation() + e.preventDefault()`，调用 `previewVoice(v.id)` / `stopPreview()`，**不**关闭菜单也不触发选择。
- 点击项主体区域才执行 `handleChangeVoice(v.id)` 并关闭菜单。
- 当前已绑定项左侧显示 `Check` 图标。
- 列表只列 `status === "ready"` 的 voices；预设和我的分组（`DropdownMenuLabel` + `DropdownMenuSeparator`）。

## 4. 清理

- `AssetCard.tsx` 移除已不用的 `Play / Pause` 直接渲染逻辑（仍需 import，用于下拉项里的试听按钮）。
- 不再需要 `<select>` 原生元素。
- `AssetActions` / `AssetVersionSwitcher` 不动。

## 涉及文件

- `src/components/sc/AssetCard.tsx`（唯一改动文件）

## 不在本次范围

- 缩略图卡 `AssetThumbCard`（无音色 UI）。
- `CharacterVoiceBinding` / `VoiceLibraryPanel` 等其他面板。
- 自动匹配的"性别/语言/年龄"高级推断——本期只做关键词 + 稳定哈希，后续可以再加。
