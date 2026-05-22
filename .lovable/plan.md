## 目标

完成上轮遗留的两项：**(5) + 加号附件上传 & @ 引用素材**、**(6) DotGrid 鼠标跟随效果全局常驻**。

仅改动前端与展示层；store 已具备 `attachments` 状态与 `addAttachment / removeAttachment / clearAttachments`，无需新增业务逻辑。

---

## 5. 附件上传 + @ mention

### 5.1 新增 `AttachMenu.tsx`
点击命令栏左下角"+"按钮触发，使用 shadcn `Popover`，提供三个入口：
- **Upload from device** — 隐藏 `<input type="file" accept="image/*,video/*" multiple>`；选中后用 `URL.createObjectURL` 生成本地预览，写入 `attachments`。
- **Paste URL…** — 行内 input，回车后作为远程 URL 资源加入。
- **From gallery** — 列出当前 task 已生成 `assets`（A01/V01/scene 帧），选中后插入为引用型附件。

每条 attachment 结构（`types.ts` 中 `Attachment` 已存在则复用，否则补全）：
```ts
type Attachment = { id: string; kind: 'image'|'video'|'url'|'asset'; name: string; url: string; thumb?: string; ref?: string /* @A01 */ };
```

### 5.2 新增 `AttachmentChips.tsx`
渲染于 `CommandInput` 文本框上方一行，缩略图 + 文件名 + ✕ 删除按钮；超过 3 个折叠为 "+N"。圆角 `rounded-xl`，hover 高亮 accent。

### 5.3 新增 `MentionPopover.tsx`
在 `CommandInput` 内监听 textarea：
- 检测光标前最后一个 `@` 到光标的子串作为 query；
- 弹出锚定 caret 的 Popover，列出 `attachments` + 当前 `assets` 过滤后的项；
- 选中插入 `@A01 ` 文本占位，并在 submit 时收集所有 `@xxx` token 推入新增 `mentions` 字段（仅展示用，不改业务流）。

键盘：↑/↓ 选择、Enter 确认、Esc 关闭。

### 5.4 `CommandInput.tsx` 改造
- 左侧 "+" 按钮接入 `<AttachMenu />` 作为 Popover trigger（保留现样式）。
- textarea 上方插入 `<AttachmentChips />`（仅在 `attachments.length > 0` 时显示）。
- 文本变化时驱动 `<MentionPopover />`。
- `submit` 时清空 `attachments`（参考 AI Video Weaver 行为）。

---

## 6. DotGrid 全局常驻 + 鼠标跟随

### 6.1 `DotGridBackground.tsx` 改写
- 容器改为 `fixed inset-0 -z-0 pointer-events-none`（事件由 window 监听获取，避免遮挡交互）。
- `mousemove` / `mouseleave` 监听绑定到 `window`，使用 `clientX/Y` 直接换算；ResizeObserver 改为监听 `window resize`。
- 启动 `requestAnimationFrame` 缓动：mouse 位置走 lerp（cur += (target-cur)*0.15），离开屏幕后亮度逐帧衰减归零，不直接 toggle。
- 高亮色直接读取 `getComputedStyle(document.documentElement).getPropertyValue('--accent')`，亮/暗主题一致生效。
- 去掉 `bg-[radial-gradient(...var(--background))]` 的硬遮罩，改为更柔的 `mask-image: radial-gradient` 让中心点阵保留可见，仅边缘淡出。

### 6.2 挂载位置
- 将 `<DotGridBackground />` 提升到 `src/routes/index.tsx` 的最外层（Sidebar+Workspace 之外），始终渲染。
- 从 `Workspace.tsx` body 中删除 `{phase === 'empty' && <DotGridBackground />}` 这一行。
- `Workspace` / `Sidebar` 根容器保持 `bg-background`，给元素以不透明背景遮住背景画布；命令输入框、卡片等已有 `bg-surface` / `bg-surface-2`，无需额外改动。
- 空状态 (`phase === 'empty'`) 的中央卡片区背景调整为透明，使点阵在主画布区可见；其他阶段由不透明 `surface` 卡片自然遮挡。

---

## 涉及文件

**新建**
- `src/components/sc/AttachMenu.tsx`
- `src/components/sc/AttachmentChips.tsx`
- `src/components/sc/MentionPopover.tsx`

**修改**
- `src/components/sc/CommandInput.tsx` — 接入三个新组件
- `src/components/sc/DotGridBackground.tsx` — 改为 fixed 全局 + 缓动
- `src/components/sc/Workspace.tsx` — 移除条件渲染
- `src/routes/index.tsx` — 顶层挂载 DotGrid
- `src/lib/sc/types.ts` — 必要时补全 `Attachment` 字段（如缺 `thumb` / `ref`）

---

## 验收点
1. 点击 "+" 弹出菜单，三种入口均能向命令栏添加 chip，✕ 可删除。
2. 在 textarea 输入 `@` 出现引用面板，选中后插入 `@A01`。
3. 鼠标在任意阶段移动，全屏点阵跟随出现 accent (#71F0F6) 光晕，离开窗口柔和淡出。
4. 切换亮/暗主题，点阵亮度自适应，不破坏可读性。