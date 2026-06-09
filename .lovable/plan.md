# 计划：从分镜视频抽取音频并展示在「音频」面板

## 现状（已排查）
- `MediaRail.tsx` 的 `TaskAudioPanel` 已经能按 `kind === "audio"` 的 asset 分到 对白 / 旁白 / 背景音乐 三栏，并渲染 `<audio controls>`。
- 但全局 `assets` 里**根本没有任何** `kind: "audio"` 的资源 —— `store.ts` 只在 life 阶段写入 `kind: "video"`，从未把视频里的音轨拆出来。这就是 `音频 0` 的根因。
- ffmpeg.wasm 已作为依赖装好（合成播放器在用），可以复用做音频抽取，不用新增依赖、不用后端改动。

## 改动范围（只动 3 个文件，全部前端）

### 1. 新增 `src/lib/sc/extract-audio.ts`
- 导出 `extractAudioFromVideo(videoUrl: string, outName: string): Promise<{ url: string; mime: string }>`。
- 内部 `import('@ffmpeg/ffmpeg')` + `@ffmpeg/util`，复用与 `MergedFilmPlayer` 相同的 core CDN 配置；首次调用懒加载。
- 命令：`ffmpeg -i in.mp4 -vn -acodec libmp3lame -b:a 128k out.mp3`；失败回退 `-acodec aac out.m4a`。
- 输出 Blob 后用 `URL.createObjectURL` 得到 `blob:` URL 返回（task 生命周期内有效，足够预览/下载用）。
- 静默：若视频本身无音轨（ffmpeg 报 `Stream map ... matches no streams`），返回 `{ url: "", mime: "" }`，上层据此跳过添加，不报错。

### 2. `src/lib/sc/store.ts`
仅在视频段 **变为 Ready** 后追加抽音步骤，**不动**任何现有流程：
- 在 life 段轮询成功 + `manual-retry` 成功这两处（`updateAssetWithVersion(... 'manual-retry'...)` 与首次 ready 写入处），新增 `void extractForAsset(asset)` 副作用。
- 新增私有 `extractForAsset(videoAsset)`：
  1. 跳过条件：已有 `audio:${videoAsset.id}` 的 asset，或 `videoAsset.url` 为空。
  2. 调 `extractAudioFromVideo(videoAsset.url!, ...)`。
  3. 成功且 `url` 非空 → `addAssets([{ id: 'audio:'+videoAsset.id, kind: 'audio', label: 'A'+seg, caption: '对白 · '+(videoAsset.caption ?? videoAsset.label), status: 'Ready', url, stageId: 'life', sourceShotId: videoAsset.id }])`。失败 → 仅 `console.warn`，不进 store、不弹 toast。
- 对 task 恢复路径（restoreTask）：若历史 task 已有 video 但没有对应 audio，在 task 进入 workspace 后**仅当用户首次打开「音频」tab**才补抽？→ 为避免越权，本次只在「新生成」时抽；旧任务保持原状。

### 3. `src/lib/sc/types.ts`
无需改动（`Asset.kind` 已包含 `"audio"`）。

## 不动
- 不动 chat、Workspace、MergedFilmPlayer、Sidebar、视频卡片、文案。
- 不引入后端 / edge function / 新依赖。
- 不动音色库 tab、不动 UI 样式。

## 验收
1. 等已有视频段重新生成或新 task 跑完 life，「音频」tab 计数从 0 变成 = 已 Ready 的 V 段数。
2. 「任务音频 → 对白」每行能播放，时长 = 对应视频时长。
3. 视频确实无音轨时，不报错、不出现空行。
