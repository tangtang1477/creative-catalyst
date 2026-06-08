## 现象与根因定位

从录屏可以看到：在项目详情页点击 task 卡片 → 跳到 `/`，但工作区直接显示「Victoria, what are we creating today?」首页空状态（phase=empty），任务并没有被恢复。这就是用户感知的「闪退回首页」。

走查后定位到根因链路（按概率排序，本次一并修掉）：

1. **`handleOpenTask` 用 id 二次查表，存在竞态与不一致**
   `projects.$projectId.tsx#handleOpenTask` 当前是：
   ```ts
   const candidate = useSC.getState().taskHistory.find(t => t.id === taskId);
   if (!candidate) { toast.error(...); return; }
   if (!canRestoreTaskRecord(candidate)) { toast.error(...); return; }
   restoreTask(taskId);
   navigate({ to: "/" });
   ```
   渲染出来的 `tasks` 来自 `useMemo([...taskHistory], project)`，而点击时再去 `useSC.getState().taskHistory.find` 取一次。理论上一致，但当远端 ingest 的写入与 React 渲染之间出现一帧错位，或者用户在 loading 完成前点击，`candidate` 可能是 `undefined`，这时函数 return，可看到 toast；但更隐蔽的是：即便能查到，`restoreTask` 内部又做了一次 `canRestoreTaskRecord(found)` 校验（store.ts:3287），任一关失败就**静默 `return`**，**而上层 `navigate({ to: "/" })` 已无条件执行** —— 这就是「跳到 / 但工作区是空首页」的直接原因。

2. **远端 ingest 出来的 TaskRecord 可能 `snapshot` 为空**
   `listProjectTasks` 返回的旧记录里 `snapshot` 可能是 `null`，`projects.$projectId.tsx` 的 `ingest()` 会把它 normalize 成 `assets:[] / stageSummaries:{} / stageSnapshots:{} / script:null`。然后 `restoreTask` 走到末尾，把 `phase` 置为 `"done"`，但 `chatLog` / `stages` / `assets` 全空 —— 视觉上虽然不是首页，但只有一句「已完成…可以继续」的孤立提示，用户也容易误判为「没进去」。再加上路径 1 的静默 return，整体就是闪退。

3. **`restoreTask` 失败时没有任何用户反馈，也没回写 phase**
   静默 return 后 caller 仍然 navigate，导致跳到 `/` 后 phase 维持 caller 之前的值（在 SSR 首次进入项目详情时 phase 一直是初始 `empty`），表现就是「点了一下，回到首页」。

## 修复方案（仅改三个文件，不动样式 / 文案 / 其它模块）

### 1) `src/lib/sc/store.ts`
- 将 `restoreTask` 的静默 `return` 改为返回 **布尔值**（`true = 已恢复 / false = 数据不足`），保留 normalize 容错；同时把校验放宽到「只要有 id 就尝试恢复」，对缺数据的旧记录走「**最小可视恢复**」分支：
  - `phase` 强制设为 `"done"`（即使 `assets=[]`），保证 Workspace 进入 inFlow 渲染、不会回落到首页空状态。
  - chatLog 注入一条友好提示：「该任务的归档数据已不可用，但仍可基于当前项目继续创作 / 重做某一步」。
  - 不再因 `canRestoreTaskRecord=false` 就 return；这条防线移交给 caller 决定是否提示，**store 端永远把 phase 接管到非 empty 状态**。
- 修改签名：`restoreTask: (id: string) => boolean`。

### 2) `src/routes/projects.$projectId.tsx`
- `handleOpenTask` 改为：
  - 直接拿 `useMemo` 渲染时手里的 `TaskRecord`（把整条记录传进 onClick，不再用 id 二次查表，避免任何竞态）。
  - 调用 `restoreTask(record.id)` 并读返回值；只有返回 `true` 才 `navigate({ to: "/" })`，否则在原地 toast `已知失败原因`，**不再无条件跳走**。
  - 对 store 已统一兜底为 `done` 的记录，返回值始终是 `true`，从而保证：只要 task 卡片可见，点击就一定能落到 Workspace 的非空界面。
- `tasks.map(...)` 把当前 `t` 直接传给 `handleOpenTask(t)`。

### 3) `src/components/sc/Sidebar.tsx`
- 同步收口 Sidebar 的 task 点击逻辑：消费 `restoreTask` 的布尔返回值，仅在成功时 `navigate({ to: "/" })`；与项目详情页保持一致，避免另一处再触发同样的闪退。

## 不动的部分

- 不动 `__root.tsx`、Workspace、Sidebar 样式与文案。
- 不动 hydrateFromStorage / Index useEffect / projects-store。
- 不动远端 ingest / backfill 逻辑（数据完整性问题用「最小可视恢复」覆盖即可，无需改 server）。

## 验证步骤

实施完成后，按 memory 要求实地验证：

1. 在项目详情页点击「做一个30秒 9:16 的连续剧第一集」→ 应进入 `/`，Workspace 显示该 task 的恢复界面（最少能看到一条引导消息和顶栏 task 名），**不再回到「Victoria…」首页**。
2. Sidebar 点同一个 task → 行为一致。
3. 点击任意其它历史 task（含 localStorage 旧记录、远端 snapshot 为空的记录）→ 都不再闪退。
4. 故意删 localStorage `sc.tasks` 后再点远端 task，验证「最小可视恢复」生效。

## 与既有 memory 的关系

完全遵守 `mem://constraints/task-restore-safe.md`：
- 仍 normalize 残缺 TaskRecord；
- 仍保留 `canRestoreTaskRecord` 作为「值不值得给出明确错误提示」的参考，但**不再用它作为静默退出条件**；
- 项目详情页 / Sidebar 仍 `navigate({ to: "/" })`，但**只在恢复成功后**；
- 时间格式化、errorComponent、SSR 守卫保持不变。
