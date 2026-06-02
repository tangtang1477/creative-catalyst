## 三个问题的修复方案

### 问题 3（最关键 · 视频接口 422）

**根因**：`src/lib/sc/store.ts` 在调用 Seedance `reference-image-to-video` 时传的是 `image_url` + `reference_image_urls`，但服务器返回 `HTTP 422 body.image_urls Field required` —— 实际字段名应为 `image_urls`（数组）。两处调用（首次生成 line ~1176、单条重做 line ~1462）都错。

**修复**：
- 把两处 payload 改成 `image_urls: refs`（数组，已经是 `[...wardrobeRefs, keyUrl].slice(0,6)`），去掉 `image_url` 与 `reference_image_urls`。
- 在 `src/lib/seedance.functions.ts` 的 `SubmitInput.payload` 里把 `image_urls`/`image_url` 显式列入 passthrough 注释，方便后续维护（schema 本身用 `.passthrough()` 已能透传，只需保证客户端字段对）。
- 修完后单条「重试」自然走对，本次 422 即解决。

### 问题 2（广告场景下角色/场景素材与音色没出现）

**现状**：pipeline 顺序是 `scene → structure → wardrobe(W01/W02/P01 + 自动绑音色) → paint(关键帧/storyboard) → life(视频)`。代码里 wardrobe 阶段确实会建角色卡并自动绑预设音色，但用户在广告路径下看到的是「直接进 storyboard」。

**排查 + 修复**：
1. 在 `runScript`/进入 wardrobe 的分支里增加日志，确认广告（`adType` 含 "广告/ad/brand/tvc"）是否被某个 early-return 跳过；如果是，恢复广告也强制走 wardrobe。
2. `runWardrobe` 内的 `script.wardrobe` 在广告剧本里可能为空数组（不是 undefined），导致跳过默认 W01/W02/P01 兜底。把判断从 `script?.wardrobe?.length` 改成 `Array.isArray(script?.wardrobe) && script.wardrobe.length > 0`，否则用兜底列表。
3. 音色绑定：当前依赖 `useVoices` 已经 `fetchVoices()` 出 `status==='ready'` 的声音。在广告路径下若音色库还没加载，会绑 0 个。改成：`fetchVoices()` 失败/为空时，调用 `voices.functions` 的预设列表作为兜底；并在 `AssetCard` 上无论是否绑定都显示「音色：xxx / 未绑定 · 选择」chip，让用户能手动选。
4. 保证 wardrobe 完成后才 `openGate('wardrobe', runPaint)`，避免广告分支提前进 paint。

### 问题 1（积分圆环刻度与「合上=多少」）

**现状**：`CreditRing` 用 `pct = used / total`，`total = 100(基础额度) + Σtopups`。所以用户买 3000 后 total = 3100，「圆环合上」= 3100；显示 1426 剩余时 used≈1674，应该填 ~54%，但截图里只看到一小段亮弧 —— 说明本地 `used` 和后端不同步（topup 后 total 涨了，但 used 是来自更早一次 `syncFromBackend`/本地缓存的旧值）。

**修复**：
1. `topUp` 成功后立即再调一次 `syncFromBackend()`（或直接用返回的 `used`/`total` 覆盖本地缓存），保证 `used/total` 同时刷新。
2. `CreditRing` 旁加一个 hover tooltip：「已消耗 X / 总额度 Y（含充值）· 圆环合上代表用完 Y 积分」，避免用户对刻度产生歧义。
3. `CreditsHoverPanel`（点击头像展开的小卡）里把 `Plus Plan` 那一行加一行小字：`额度 100 + 充值 N = 共 Y 积分`，让用户一眼能看到「合上 = 多少」。
4. 顺手修一处：`canAfford` 当 `total - used < 0` 时返回 false 但 UI 显示 remaining 仍可能为负 → 已在 `creditsSelectors.remaining` 用 `Math.max(0, …)` 兜住，无需额外改。

### 技术细节

- 文件改动：`src/lib/sc/store.ts`（视频 payload × 2 + wardrobe 兜底）、`src/lib/seedance.functions.ts`（注释）、`src/lib/sc/credits-store.ts`（topUp 后同步）、`src/components/sc/credits/CreditRing.tsx`（tooltip）、`src/components/sc/credits/CreditsHoverPanel.tsx`（合计行）、`src/components/sc/AssetCard.tsx`（音色 chip 始终显示）。
- 验证：跑一次完整广告任务 → 看到 W01/W02/P01 + 音色 chip → 进 paint → 进 life 不再 422。
- 不改：阶段顺序、积分 ledger 表结构、ElevenLabs SDK 接入方式。