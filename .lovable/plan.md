## 修复内容

### 1. 侧边栏「我的项目」区块改版（对齐图1样式）

文件：`src/components/sc/Sidebar.tsx`

- 把分组标题改成「我的项目」，**FolderPlus 图标移到文字左侧**（与图1的视觉一致），右侧只保留折叠箭头。
- 在项目列表顶部新增一行「新项目」入口（FolderPlus 图标在左 + 文字「新项目」），点击调用 `openCreateProject(null)`。
- 当项目列表为空时，仍保留虚线提示；不为空时「新项目」作为常驻第一行。
- 同步首页 `Workspace.HomeProjectsRow` 的「新建项目」按钮样式不动，保留作为辅助入口。

### 2. 点击项目能进入对应内容

当前 `handleSelectProject` 只调用 `setCurrentProject + reset`，并未还原任何任务，所以「点了没反应」。

文件：`src/components/sc/Sidebar.tsx`、`src/components/sc/Workspace.tsx`、`src/lib/sc/store.ts`

逻辑：
1. 在 store 中新增 `enterProject(projectId)` action：
   - 设置 `currentProjectId`。
   - 在 `taskHistory` 中按 `project.name === task.title` 匹配，找到最新一条 → 调用现有 `restoreTask(id)` 还原该任务（角色、场景、storyboard、视频全部回到工作区）。
   - 若没匹配到历史任务：`reset({ fromUserAction: true })` 进入空白工作区，让 `ProjectGuideCard` 显示该项目上下文，引导用户开启新一集。
2. Sidebar `handleSelectProject` 和 Workspace `HomeProjectsRow.onPick` 全部改调 `enterProject(id)`，移除原本各自的 reset 逻辑。
3. 正在 running/thinking 阶段时，弹 confirm「当前任务进行中，确认切换项目？」再执行。

### 3. 头像外圈积分环实时联动（图2）

文件：`src/components/sc/credits/CreditRing.tsx`、`src/lib/sc/credits-store.ts`、`src/components/sc/UserHoverCard.tsx`

当前问题：环按 `used/total` 渲染，充值后 `total` 变大、`used` 不变，比例极小几乎看不见变化；视觉上像「不会动」。

修改：
1. **改为「剩余比例」可视化**：`pct = remaining / total`，环从满圈开始随消耗逆时针收缩。
   - 颜色：`remaining/total > 50%` 用 `--accent`（青色），`≤50%` 用 `--credit-low`（琥珀），`≤20%` 用 `--credit-critical`（红 + 脉冲）。
   - 圆环耗尽 = 积分用完，与用户直觉一致。
2. **动效反馈**：订阅 `pulseId`，每次 `consume()` / `topUp()` 后给环加一个 280ms 的 scale/opacity 高亮闪动，让变化立刻可见。
3. **充值后强制刷新**：`topUp` 成功后已调用 `getCreditsBalance` 同步，再额外 `set({ pulseId: pulseId + 1 })`，触发环动画。
4. UserHoverCard 顶部 3px 进度条沿用 `pctRemain`（已经是剩余制），同步调整阈值与 CreditRing 对齐。
5. `title` 提示文案改为：`剩余 X / 总额度 Y（已消耗 Z）· 圆环耗尽代表积分用完`。

### 涉及文件汇总

- `src/components/sc/Sidebar.tsx` — 项目区块结构、`enterProject` 接线
- `src/components/sc/Workspace.tsx` — `HomeProjectsRow.onPick` 接线
- `src/lib/sc/store.ts` — 新增 `enterProject` action
- `src/components/sc/credits/CreditRing.tsx` — 改为剩余比例 + pulse 动效
- `src/lib/sc/credits-store.ts` — `topUp` 后递增 `pulseId`
- `src/components/sc/UserHoverCard.tsx` — title/阈值对齐
