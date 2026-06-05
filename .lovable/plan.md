# 修复计划：暂停后真正停止当前生图

## 问题确认
当前“暂停”只冻结了 store 里的定时器队列，没有中断已经发出的图片生成请求，所以会出现：
- 按下暂停后，`/api/generate-image` 对应的 SSE 还在继续返回分片
- `onPartial` 仍持续写入图片预览，卡片继续显示 `Generating image`
- 当前镜头这一轮生成实际上没有停住，只是后续调度被暂停了

## 我会改什么

### 1. 给运行中的生成请求加可中断控制
在 `src/lib/sc/store.ts` 里为当前任务维护“在途请求”的 abort 控制器注册表：
- 图片生成请求
- 当前阶段里可能持续轮询的长请求

暂停时不只处理 `timers`，还会统一 `abort()` 当前在途请求。

### 2. 把生图链路接上 `AbortSignal`
把 `runPaint` / 单图重做 / 相关流式生图调用接到同一套中断机制上：
- `streamGenerateImage({ signal })`
- 暂停时立即打断当前正在进行的 SSE 读取
- 被打断后不再继续上传最终图、不再把该轮结果写回 asset

### 3. 区分“暂停中断”与“真实失败”
暂停不应把当前图片标成失败：
- 被暂停打断的 asset 从 `Generating` 退出，回到可恢复的静止状态
- 阶段不进入 `failed`
- 恢复后从当前未完成项继续，而不是错误结束

### 4. 修正暂停时的界面表现
同步修正 UI 状态，避免“已暂停但还在转圈”：
- 暂停后当前 asset 不再显示 `Generating image`
- 阶段行不再继续显示 running spinner
- 输入框按钮继续保持“恢复”语义

## 涉及文件
- `src/lib/sc/store.ts`
- `src/lib/upload-image.ts`
- `src/components/sc/AssetCard.tsx`
- 如有必要：`src/components/sc/StageRow.tsx`

## 技术说明
当前根因集中在这两处：
- `pauseTask()` 现在只搬运 `pendingInfo/suspended`，没有处理中途中的 `fetch/SSE` 请求
- `runPaint()` / 单图重做里的 `streamGenerateImage()` 没有接入统一 abort 机制，所以请求会继续完成

修复后，暂停语义会变成：
```text
暂停 = 停止后续定时调度 + 中断当前在途生图请求 + 冻结 UI 运行态
恢复 = 从未完成镜头继续发起下一次生成
```

## 验收
我会按这个结果校验：
1. 关键帧生成中点击暂停，当前卡片不再继续刷新预览
2. `Generating image` 状态立即消失，不再假装仍在运行
3. 恢复后从未完成镜头继续，不会把已完成镜头重跑
4. 暂停不会把任务误标为失败