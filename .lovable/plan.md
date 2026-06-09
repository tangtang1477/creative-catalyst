# 计划：视频分镜预览修复 + 完整成片真实合成

## 目标
1. 分镜卡片里的视频能正常显示时长 / 首帧 / 内联播放（当前显示 0:00）。
2. "合成完整成片" 区域真的合成成片：默认用顺序连播预览（零等待），并提供 `导出合并 MP4` 按钮触发 ffmpeg.wasm 真实拼接 + 下载。

## 改动范围（仅触及用户点名的两处）

### 1. `src/components/sc/AssetCard.tsx` — 修分镜视频预览
将视频元素改为：
```tsx
<video
  src={asset.url}
  poster={asset.poster}
  controls
  playsInline
  preload="metadata"
  crossOrigin="anonymous"
  className="block w-full bg-black"
  style={{ aspectRatio: aspectCss, maxHeight: maxH }}
/>
```
只动这一段 `<video>` 标签，不动其它逻辑/样式。

### 2. 新增 `src/components/sc/MergedFilmPlayer.tsx`
自定义顺序播放器：
- 接收 `segments: { id, url, duration }[]`。
- 单 `<video>` 元素，播完一段自动切到下一段（监听 `onEnded`），用 `<source>` 替换 `src`。
- 顶部一条总进度条（已播放秒数 / 总秒数），带分段刻度。
- 控制条：播放/暂停、当前段标签（V01/V02…）、全屏、`导出合并 MP4` 按钮。
- 导出按钮点击时动态 `import('@ffmpeg/ffmpeg')` 并加载 `@ffmpeg/util`，下载各分镜 → `concat demuxer` 拼接 → 生成 Blob → 触发下载 `final.mp4`。期间显示进度（`ffmpeg.on('progress')`）。
- wasm 失败时回退提示"导出失败，可逐段下载"。

### 3. `src/components/sc/Workspace.tsx` — details 阶段嵌入播放器
仅修改 `id === "details"` 分支内 `<div className="rounded-2xl ...">` 那段：
- 保留标题 + 段数徽章 + 一句状态文案。
- 当 `st.status === "ready"` 且 `lifeAssets.length > 0` 时，在文案下方渲染 `<MergedFilmPlayer segments={lifeAssets.map(...)} />`。
- 其余分支（running / 待确认）不变。
- 不改其它阶段、不改 QC 位置（保留在播放器下方）。

### 4. 依赖
```bash
bun add @ffmpeg/ffmpeg @ffmpeg/util
```
ffmpeg core 文件走官方 CDN（`unpkg.com/@ffmpeg/core@x.x.x/dist/esm`），不打包进首屏 bundle，仅点击导出时按需加载。

## 不动的部分
- 不改 store、types、chat、其它阶段、Sidebar、AssetThumbCard、AssetActions、StageRow 等。
- 不改文案/间距/字号，除上述指定位置。
- 不改业务逻辑，仅前端展示与新增合成播放器。

## 验收
1. 任意已生成的视频分镜卡片：能看到时长，能在卡片里点击播放。
2. details 阶段 ready 时，下方出现连播播放器；点播放从 V01 → V02 无缝连放。
3. 点击"导出合并 MP4" → 显示进度 → 自动下载单个 mp4 文件，时长 ≈ 各分镜时长之和。
