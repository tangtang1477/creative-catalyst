## 本轮改动计划（7 项）

### 1. Claude icon 修正
当前 `BrandIcons.tsx` 中 Claude 是一个橙色八角星，与官方不符。改成 Anthropic 官方的 Claude 标志（橙色螺旋花瓣/星芒，由四个不对称放射形花瓣组成）。SVG 路径替换为官方 Claude logomark 形状，颜色保留 `#D97757`。

### 2. 右下角设置 icon → 主题切换太阳/月亮
`Sidebar.tsx`（或 `UserHoverCard.tsx`）右下角现在的齿轮 icon 替换为太阳/月亮切换按钮：
- 暗色态显示 `Moon`，亮色态显示 `Sun`（lucide-react）
- 直接调用 `useTheme().toggle()`，去掉 hover-card 内重复的切换条目（或保留二者同步）
- 按钮独立可点，不被 hover-card 拦截事件（`stopPropagation` + `onClick`）

### 3. 输入框打字机 placeholder
`CommandInput.tsx` 在 `value === ''` 且未聚焦/聚焦皆可时，用打字机动画轮播 6 条提示语：
- "做一个香奈儿香水的高端广告片"
- "拍一集都市恐怖短剧的第一集"
- "生成一支美食探店 vlog 的开场"
- "制作一支运动品牌的 15 秒 TVC"
- "做一个连续剧的第二集，主角是侦探"
- "生成一支宠物日常的治愈短片"

实现：新 hook `useTypewriterPlaceholder(phrases, { typeMs:55, holdMs:1600, eraseMs:30 })`，输出当前字符串，注入到 `<textarea placeholder>`；用户开始输入后停止轮播。

### 4. 点阵密度提升
`DotGridBackground.tsx`：`spacing` 26 → 18；`glowRadius` 160 → 180；半径基数保持 1，避免过亮。

### 5. AutoRun 文案修复
`AutoRunMenu.tsx` 触发按钮标签：
- `autoMode === 'auto'` → 显示 "Auto Run"
- `autoMode === 'confirm'` → 显示 "Confirm"
（去掉 "Auto Run · Auto" / "Auto Run · Confirm" 这种连写）

下拉项文案保持「Auto-run without asking」「Confirm before running」不变。

### 6. 用户名改为 Victoria@gmail.com
全局替换 `Vic` / `galileo_slug_500` 等显示用名 → `Victoria@gmail.com`：
- `UserHoverCard.tsx`
- `Sidebar.tsx` 底部用户区
- `store.ts` 历史 task 作者字段（若展示）
保留 "Plus Plan" 副标题。

### 7. Intake 卡片流式输出 + 真实 loading + Others 引导输入框 + Auto 模式分段确认

#### 7.1 流式渲染问题选项
`IntakeCard.tsx` 现在一次性渲染所有问题与 chips。改为：
- 进入 intake 阶段后先显示一行 loading（"Analyzing your brief..." + shimmer），延迟 1200–1800ms 出现第 1 题；
- 每个问题的标题先逐字流式打字（复用上面 typewriter 工具，速度 18ms/char），打完后再逐个 chip fade-in（stagger 80ms）；
- 问题之间间隔 600ms + 800ms loading dot；
- 全部出现完毕再显示底部 Skip / Continue。

新增内部状态 `revealedQuestions: number`、`revealedTitleChars: number`、`revealedChipsPerQ: number[]`，用 `setInterval` 推进；卸载清理。

#### 7.2 Others → 引导到输入框
`OthersChip.tsx` 点击行为改为：
- 不在卡片内插入 input；
- 调用 store 新 action `focusCommandInputWithHint(questionId)`，把 CommandInput placeholder 临时锁定为 `"输入你想要的「{question 简称}」…"`，并自动 focus；
- 用户在输入框内输入后回车，作为该题自定义答案写入 intake answers，并解除锁定。

#### 7.3 Auto 模式也分段输出 + 中途询问
`intake-engine.ts` / `store.ts` 在 `autoMode === 'auto'` 时：
- 不再跳过 intake 直出全流程；
- 而是改为：自动选默认答案 → 流式输出剧本（script）→ 暂停弹一条 inline 询问 "剧本已生成，是否继续生成镜头脚本？[继续 / 调整]"；用户确认后 → 流式输出 shotlist → 再次询问 → 流式生成素材 → 最终成片。
- 每段生成都走真实 loading（2.5–4s）+ 字符级流式追加，禁止瞬时 dump。
- "Confirm" 模式保持现有"每步手动 approve"。

涉及：`store.ts` 新增 phase `awaiting_continue`，`StageRow.tsx` 追加确认气泡组件 `<ContinuePrompt />`。

---

## 涉及文件

**修改**
- `src/components/sc/BrandIcons.tsx` — Claude SVG
- `src/components/sc/Sidebar.tsx` / `UserHoverCard.tsx` — 主题切换按钮 + 用户名
- `src/components/sc/CommandInput.tsx` — 打字机 placeholder + Others 锁定
- `src/components/sc/DotGridBackground.tsx` — 密度
- `src/components/sc/AutoRunMenu.tsx` — 标签文案
- `src/components/sc/IntakeCard.tsx` — 流式渲染
- `src/components/sc/OthersChip.tsx` — 改为引导输入框
- `src/components/sc/StageRow.tsx` — 新增 `<ContinuePrompt />`
- `src/lib/sc/store.ts` — `awaiting_continue` phase、`focusCommandInput*`、`autoMode='auto'` 分段流程
- `src/lib/sc/intake-engine.ts` — auto 模式逐段推进
- `src/lib/sc/samples.ts` — 打字机短语数组（如果集中放）

**新建**
- `src/hooks/use-typewriter.ts` — 通用打字机 hook（placeholder + 标题流式都复用）
- `src/components/sc/ContinuePrompt.tsx` — 中途"继续 / 调整"询问气泡

---

## 验收点
1. Claude 选项与下拉里的图标为官方 Anthropic Claude 形状。
2. 右下角点击太阳/月亮可即刻切换亮暗主题，hover 卡片内开关与之同步。
3. 空输入时输入框 placeholder 在 6 条提示之间打字-停留-擦除-下一条循环；开始输入后立即停止。
4. 点阵密度明显变密，鼠标光晕仍然柔和。
5. AutoRun 按钮文字在 "Auto Run" ↔ "Confirm" 之间切换。
6. 侧边栏 + hover 卡片中所有用户名显示为 `Victoria@gmail.com`。
7. 进入 intake：先 loading → 第一题标题逐字出现 → chips 逐个淡入 → 下一题，节奏自然；点 Others 不在卡片插 input，而是输入框聚焦并显示对应 hint placeholder，回车后回填该题。
8. Auto 模式不再一口气走完：剧本流式生成 → 弹"是否继续"→ 用户确认 → 镜头脚本 → 再确认 → 素材生成。每段都是字符级流式 + 2.5s+ 真 loading。
