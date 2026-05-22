## 本轮改动计划

### 一、画布点阵优化（轻量美观）

**文件**：`src/components/sc/DotGridBackground.tsx`

- `spacing` 18 → 14（密度提升约 40%）
- `glowRadius` 180 → 120（光源范围缩小）
- 基础半径基数 1 → 0.7（点更细更轻）
- 鼠标光下最大半径增量 1.3 → 0.9（避免堆头过亮）
- 基础透明度 0.05/0.08 → 0.04/0.06，光下叠加 0.6 → 0.45
- mask 渐变收紧：55% → 45%，更聚焦中部

效果：更密、更细、光晕更小更柔，整体观感"轻量美观"。

---

### 二、按 ai-video-studio skill 重构交互流程

skill 的核心契约：**固定阶段名 + 资源卡 + 折叠细节 + 类型自适应 + 集数延续 + 真实生成证据**。当前实现是"广告片单一流程"，需要重构为多类型 + 系列剧 + 严格阶段编排。

#### 2.1 首条响应文案（铁律 1）

`src/components/sc/Workspace.tsx` 空态首屏标题区改为：

> **Using skill ai-video-studio**
> 你好，我可以帮你把想法、角色、产品或素材做成 AI 视频。告诉我类型和目标，或直接选下面的方向。

下方紧跟 **Create Brief** 4 题（与 skill 一致，覆盖现有 intake）：

1. 视频类型：Short cinema(推荐) / Series·Episodes / Ad·Brand film / Music·Fashion / Documentary·Explainer / UGC·Social / Other
2. 投放规格：15s 9:16(推荐) / 30s 9:16 / 16:9 / 1:1 / Other
3. 画面来源：自动生成角色·场景(推荐) / 使用上传素材 / 产品·主体特写 / 无人物 / Other
4. 创作模式：全自动连续推进(推荐) / 关键阻塞项才问我 / 关键节点确认 / 严格按资料

**改文件**：`src/lib/sc/intake-engine.ts`（重写默认选项与推断）、`src/components/sc/IntakeCard.tsx`（标题与底部状态：`Awaiting your input`）。

#### 2.2 固定 6 阶段标签替换

skill 阶段名是硬规范，当前 store phase 命名不符合。新增映射：

| skill 阶段 | 触发条件 |
|---|---|
| Awaiting your input | intake 未完成 |
| Building the scene | 选定 brief，输出创意方向/世界观/主体策略 |
| Structuring the film | 剧本/分镜/节奏表 |
| Painting the frame | 关键帧（A01/C01/E01/P01）生成 |
| Bringing it to life | first-frame-to-video（V01...） |
| Adding the details | QC + Next chips |

**改文件**：
- `src/lib/sc/types.ts`：`Phase` 类型重命名为这 6 个 + 保留 `awaiting_continue`
- `src/lib/sc/store.ts`：阶段推进与 `autoMode` 分段确认改为以上 6 段
- `src/components/sc/StageRow.tsx`：标题文案改为新阶段名（中英对照副标题）
- `src/components/sc/Workspace.tsx`：阶段顺序渲染

#### 2.3 类型自适应（核心新增）

新增 `src/lib/sc/video-types.ts`，按类型返回不同的：

- Building the scene 字段集（如 Series：series premise / world rules / recurring cast / season arc；Narrative：premise / protagonist / conflict / mood；Ad：product / audience / promise / CTA / compliance；等等）
- Structuring 输出形态（剧本表 vs 节拍表 vs Episode Beats）
- Asset 资产分类（C01 角色 / E01 环境 / P01 道具 / A01 关键帧 / V01 视频）
- QC focus

**改文件**：
- 新建 `src/lib/sc/video-types.ts` — 类型配置表（series/short_cinema/ad/music/doc/ugc/abstract）
- `src/components/sc/ScriptTable.tsx` — 支持两种表（Script vs Beat Sheet）
- `src/components/sc/StageRow.tsx` — Building the scene 字段按类型渲染

#### 2.4 Series / Episodic 工作流（新增）

当类型 = Series，新增两块持久数据结构：

- **Series Bible**（卡片）：series / format / logline / world rules / recurring cast / standing sets / core conflict / visual grammar
- **Episode Registry**（表格）：Episode / Status / Story Function / Cliffhanger·Carryover
- **当前集 Beats** 表：Beat / Duration / Story·Action / Visual Language / Carryover
- **Continuity Registry** 表：ID / Type / Description / First Seen / Reuse Rule（C01/E01/P01 永不改名）
- 资产命名采用 `S01E01-A01` / `S01E01-V01`；C/E/P 跨集复用

新增组件：
- `src/components/sc/SeriesBible.tsx`
- `src/components/sc/EpisodeRegistry.tsx`
- `src/components/sc/ContinuityRegistry.tsx`

store 扩展：
- `series?: SeriesBible`
- `episodes: EpisodeRecord[]`
- `continuity: ContinuityItem[]`
- action：`continueNextEpisode()` — 复用 Bible/Registry/C·E·P/未解线索/上一集 cliffhanger，从 Selected Brief 起跳，**不重启 intake**

用户输入"继续上一集 / 第 2 集 / 下一集"时由 `intake-engine` 命中并直接走 `continueNextEpisode`。

#### 2.5 Auto Flow 分段确认细化

当前 store 已在 script/keyframe 加 gate。按 skill 改为：

- **全自动模式**：连续推进至交付，仅在真实阻塞（缺凭据/法务声明/不能假设的型号价格/可轮询的供应商任务）时停
- **关键节点确认模式**：每阶段尾部弹 ContinuePrompt
- **严格按资料模式**：禁止补全/假设，缺即问

**改文件**：`src/lib/sc/store.ts` 的 `autoMode` 分支按 4 种模式改写（当前只有 auto/confirm 两种，需要扩到 4 种与 intake 一致）。

#### 2.6 资产卡 & Media Proof（视觉契约）

skill 强制资产表格 4 列：Asset / Status / Preview·Link / Source。状态枚举固定为：Generating / Queued / Processing / Status checked / Ready / Recovering / Needs blocker / Failed。

- `src/components/sc/AssetCard.tsx` 改为符合 4 列规范
- 新增 `src/components/sc/AssetTable.tsx` — 阶段内统一渲染（Painting the frame / Bringing it to life / Final Assets）
- "Recovering / Failed" 文案符合 skill（如 `未返回可播放 URL`），但内部实现仍是 mock 时序

#### 2.7 折叠细节

skill 要求"完整 prompt / 负 prompt / 长场景描述 / 恢复日志 / 长剧本"默认折叠。新增 `src/components/sc/CollapsibleDetails.tsx`（包装 shadcn collapsible），在 Painting / Structuring 阶段使用。媒体 URL 永远不放在折叠内。

#### 2.8 Next-action chips（按类型自适应）

`src/components/sc/QualityCheck.tsx` 的 Next 数组改为按类型返回：

- Series：`下一集` `角色一致性` `世界观扩展` `字幕/旁白` `封面图` `改节奏`
- Narrative：`扩展下一场` `角色一致性` `字幕/旁白` `封面图` `改节奏` `比例导出`
- Ad：`A/B variant` `字幕/旁白` `封面图` `改节奏` `比例导出`
- 其他类型类似

---

### 三、涉及文件清单

**新建**
- `src/lib/sc/video-types.ts`
- `src/components/sc/SeriesBible.tsx`
- `src/components/sc/EpisodeRegistry.tsx`
- `src/components/sc/ContinuityRegistry.tsx`
- `src/components/sc/AssetTable.tsx`
- `src/components/sc/CollapsibleDetails.tsx`

**修改**
- `src/components/sc/DotGridBackground.tsx` — 密度/光源/亮度
- `src/components/sc/Workspace.tsx` — 首屏文案 + 阶段顺序
- `src/components/sc/IntakeCard.tsx` — 4 题文案/选项对齐 skill
- `src/components/sc/StageRow.tsx` — 6 阶段标签 + 类型自适应字段
- `src/components/sc/ScriptTable.tsx` — Script / Beat Sheet 双模式
- `src/components/sc/AssetCard.tsx` — 4 列规范
- `src/components/sc/QualityCheck.tsx` — Next chips 按类型
- `src/lib/sc/types.ts` — Phase 类型 + Series/Episode/Continuity 类型
- `src/lib/sc/store.ts` — 6 阶段 + 4 种 mode + Series 流转 + continueNextEpisode
- `src/lib/sc/intake-engine.ts` — 选项/默认值/`继续上一集`命中
- `src/lib/sc/samples.ts` — 各类型示例 brief

---

### 四、验收点

1. 鼠标光晕点阵更密、点更细、光圈更小，整体更精致。
2. 空态首屏顶部出现 `Using skill ai-video-studio` + 友好句 + Create Brief 4 题，底部 `Awaiting your input`。
3. Intake 4 题选项与 skill 文案一致；选 Series 后进入剧集分支。
4. 阶段标签严格为 Building the scene / Structuring the film / Painting the frame / Bringing it to life / Adding the details。
5. Series 类型显示 Series Bible + Episode Registry + Continuity Registry + 当前集 Beats 表，资产命名为 `S01E01-A01` / `S01E01-V01`。
6. 输入"继续上一集 / 下一集"不重启 intake，从 Selected Brief 直接续推。
7. 创作模式 4 选项均生效：全自动一路到底；关键节点确认每阶段询问；严格按资料缺即问。
8. 资产表 4 列规范，状态使用 skill 枚举；prompt 详情折叠，媒体链接保持可见。
9. Adding the details 的 Next chips 按视频类型变化（Series 显示 `下一集`）。
