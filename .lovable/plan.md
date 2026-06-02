# 问题诊断

逐条对照截图与代码核查后，三个问题的真实根因如下：

## 1. 服装/道具是「假图」（4 张全是同一张香奈儿香水）

不是 API 调用问题，而是命中了**未登录回退分支**：

```ts
// src/lib/sc/store.ts runWardrobe / runPaint
if (!userId) {
  appendSummary("wardrobe", "未登录 · 跳过真实生图，使用示例图");
  updateAsset(w.id, { status: "Ready", url: SAMPLE_KEYFRAME });  // ← 这就是那张香水图
}
```

`currentUserId` 由 `submit()` 里 fire-and-forget 的 `supabase.auth.getUser().then(...)` 异步写入，但 `runIntake → runScene → runStructure → runWardrobe` 通过 gate/timer 串起来，等到 wardrobe 真正跑时 `currentUserId` 可能还是 `null`，于是整批 W/P 资产全部塞了同一张 sample 图。同样的隐患存在于 `runPaint`、`runLife`、`runDetails`。

用户原话「不许乱改，调用真实接口」⇒ 直接**删掉 SAMPLE_KEYFRAME 回退**，未登录时把资产置为 `Failed` 并提示「请先登录后生成」。同时在每个 run* 的入口先 `await supabase.auth.getUser()` 同步刷新 `currentUserId`，杜绝竞态。

## 2. 图片/视频生成过程中的 loading 效果消失

`AssetCard` 的 loading 判定：

```ts
const isLoadingState = !asset.url && (status === "Queued" | "Generating" | ...)
```

但 `streamGenerateImage.onPartial` 在第一帧到来时就 `updateAsset(id, { url: dataUrl })`，于是 `!asset.url` 立刻为 false，`GradientLoader` 直接消失，只剩带 blur 的局部图——用户看不到进度提示。

修法：把 loading 判定改为 `status !== "Ready" && status !== "Failed"`（即只要还在生成就显示状态），并在 partial 图上叠加一个右下角的小型「Generating · n%」pill（带脉冲点），最终完成才移除。Video 资产 (`life`) 在 Queued/Processing 时本身就没有 url，保持原 `GradientLoader` 行为。

## 3. ElevenLabs 真实接入 + 音色与角色资产绑定可见性

核查结果：
- ✅ `voices.functions.ts` 已正确接入 ElevenLabs（`api.elevenlabs.io/v1/voices/add`、`/text-to-speech/{id}`）；`ELEVENLABS_API_KEY` 已在服务端配置；
- ✅ DB 已有 12 个 preset 音色（Sarah/George/...），均 `status=ready`；
- ⚠️ 自动绑定逻辑写在 `runWardrobe` 末尾，但**只在 `useVoices` store 已加载时生效**。用户没有打开「音色库」面板前，`voices=[]`，绑定循环静默跳过——所以「素材出现时没有绑定音色」；
- ⚠️ 即使绑定成功，**`AssetCard` 上完全没有任何音色徽标**，用户无从感知，自然会认为没接入。

修法：
- 在 `runWardrobe` 自动绑定块的最前面强制 `await useVoices.getState().fetchVoices()`（无论是否登录过音色库）；
- 在 `AssetCard` 角色资产（id 以 `W` 开头）上渲染一个音色徽标（音色名 + 试听按钮），数据来自 `character_voices` 表（通过新建的轻量 `useCharacterVoices` zustand store 拉取并缓存）；
- 资产卡上的徽标点击试听调用现有 `useVoices().preview()`，复用 ElevenLabs TTS。

---

# 具体改动

## A. `src/lib/sc/store.ts`

1. 新增 helper：
   ```ts
   async function ensureUserId(): Promise<string | null> {
     const { data } = await supabase.auth.getUser();
     const id = data.user?.id ?? null;
     useSC.setState({ currentUserId: id });
     return id;
   }
   ```
2. `runWardrobe / runPaint / runLife / runDetails` 内部把 `const userId = get().currentUserId` 改为 `const userId = await ensureUserId()`（包住在 `void (async () => { ... })` 的最前面）；
3. **删除** 未登录 → `SAMPLE_KEYFRAME` 的 fallback 分支，改为：
   ```ts
   if (!userId) {
     for (const w of wardrobeAssets) {
       updateAsset(w.id, { status: "Failed", errorMessage: "请先登录后再生成", errorCode: "auth_required" });
     }
     appendSummary("wardrobe", "未登录 · 已暂停生成，请登录后点击「重试」");
     updateStage("wardrobe", { status: "failed", errorMessage: "未登录" });
     return;
   }
   ```
   `runPaint / runLife / runDetails` 同样处理；
4. 自动绑定块前置 `await useVoices.getState().fetchVoices()`，并在绑定成功后 `useCharacterVoices.getState().refresh()` 通知 UI 刷新；
5. `submit()` 里 fire-and-forget 的 `supabase.auth.getUser()` 保留作为预热，但不再当作生成前置条件。

## B. `src/components/sc/AssetCard.tsx`

1. 修改 loading 判定：
   ```ts
   const isGenerating = asset.status === "Queued" || asset.status === "Generating"
                     || asset.status === "Processing" || asset.status === "Recovering";
   const showFullLoader = isGenerating && !asset.url;     // 视频/无 partial 时全屏 Loader
   const showOverlayLoader = isGenerating && !!asset.url; // 流式图片：partial 上叠加 pill
   ```
2. 渲染：
   - `showFullLoader` → 现有 `GradientLoader`；
   - `showOverlayLoader` → 在 `<img>` 容器右下角叠 `<GeneratingPill>`（脉冲点 + label），并保留 partial 图的 blur 动画到 Ready 才解除；
3. 角色徽标：
   - 当 `asset.stageId === "wardrobe" && /^W/i.test(asset.id)` 时，从 `useCharacterVoices` 读取该 caption 对应绑定，渲染左上 chip：`🎙 {voiceName} ▶`，点击调用 `useVoices().preview(voiceId)`。

## C. 新文件 `src/lib/sc/character-voices-store.ts`

轻量 zustand store，缓存 `character_voices` 表数据：

```ts
interface CVState {
  bindings: Array<{ id: string; character_name: string; voice_id: string }>;
  loaded: boolean;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
  voiceFor: (name: string) => Binding | undefined;
}
```

`CharacterVoiceBinding.tsx` 与新增的 `AssetCard` 徽标都从此 store 订阅，避免重复请求与不一致。

## D. 新组件 `src/components/sc/GeneratingPill.tsx`

```tsx
// 右下叠加的小型「生成中」徽标 —— 与 StageThinkingPill 同一视觉语言
<span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] text-white flex items-center gap-1">
  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
  Generating
</span>
```

---

# 验证清单

| 场景 | 期望 |
|---|---|
| 未登录用户提交 | wardrobe/paint 全部 Failed + 提示「请先登录」，**不再出现香水假图** |
| 已登录用户首次生成 | 每张 W/P 是真实 Gemini 流式生成结果，与 caption 内容一致 |
| 图片生成中 | partial 出现后仍能看到右下「Generating」徽标，完成才消失 |
| 视频段生成中 | 显示完整 GradientLoader（Queued/Processing 时无 url） |
| 角色资产卡 | W01/W02 卡片上能看到「🎙 Sarah ▶」徽标，点击能听到 ElevenLabs 真实试听 |
| 未打开音色库 | 自动绑定依然完成，徽标依然出现 |

# 不做的事

- 不替换 `streamGenerateImage` / `seedance` 现有真实接口；
- 不动 voices.functions.ts / ElevenLabs 服务端调用；
- 不改 RLS / 数据库 schema。
