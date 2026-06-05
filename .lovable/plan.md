## 目标

当前暂停只覆盖了 `wardrobe / cast / paint` 三个 runner 和它们内部的 `streamGenerateImage`。其它阶段（intake 倒计时、chat-stream 偏好分析、approval 倒计时、seedance 视频提交+轮询、retry sleep 等）点击暂停后仍会继续走完。本次把"随时暂停 / 随时继续"做成全链路统一机制，测试通过后再交付。

## 范围（要被暂停拦住的所有链路）

1. **Intake 倒计时**：`IntakeCard.tsx` 内部 20s `setInterval` 自动 Continue。
2. **Approval 倒计时**：`ApprovalChips.tsx` 内 `setInterval` 自动放行 gate。
3. **Chat-stream 偏好分析流**：`store.ts` 中两处 `fetch("/api/chat-stream")` 的 SSE 读取（约 L2405 / L2653）。
4. **streamLines 打字机**：脚本/服装/角色/分镜的文字逐行输出（已经走 `schedule()`，复核确保 100% 走 pause-aware 计时器，没有裸 `setTimeout`）。
5. **Seedance 视频阶段**：`runAnimate` 相关链路（约 L1810–L2035），包括 `submitVideoTask` 的 fetch、`await new Promise(r => setTimeout(r, 3000))` 轮询 sleep、polling fetch。
6. **details / preflight 阶段**：`streamLines("details", …)` 与后续 fetch。
7. **所有 retry sleep**：`await new Promise((r) => setTimeout(r, 3000))`（L1951、L2292）必须改成可中断的 pausable sleep。

## 技术方案

### A. 统一 pausable 原语（`src/lib/sc/store.ts`）

新增三个工具，所有阶段统一使用：

- `pausableSleep(ms): Promise<void>` —— 用 `schedule()` 包装，暂停时挂起、resume 时按剩余时间继续；被 reset/cancel 抛 `AbortError`。
- `pausableFetch(input, init): Promise<Response>` —— 自动 `registerAbort()` + `init.signal`，pause 立刻 abort。
- `pausableStreamRead(reader)` —— 读 SSE 时每个 chunk 前 `if (get().paused) await waitForResume()`，并把 reader 注册进 inflight，pause 时 `reader.cancel()`。

`waitForResume(): Promise<void>` 用 store subscribe 监听 `paused: false`。

### B. 改造点

| 位置 | 改动 |
|---|---|
| `store.ts` L2405 chat-stream fetch | 用 `pausableFetch` + `pausableStreamRead`；abort 后保留半成品 agent 文本，resume 时重新请求（带 `resumeFrom` 标记，避免重复扣费用最低成本：直接重发并复用上次 prompt） |
| `store.ts` L2653 chat-stream（同上） | 同上 |
| `store.ts` L1951 / L2292 retry sleep | 换成 `pausableSleep(3000)` |
| seedance submit + poll 链路 | fetch 走 `pausableFetch`；poll 间隔走 `pausableSleep`；pause 时把当前 asset 回滚到 `Queued`，resume 时 `schedule` 重跑当前 shot |
| `IntakeCard.tsx` 倒计时 | 读 `useSC(s => s.paused)`，paused 时 `clearInterval` 并冻结当前 `countdown` 值，resume 时按剩余秒数继续 |
| `ApprovalChips.tsx` 倒计时 | 同上 |

### C. UI 反馈

- 顶部 phase 文案 paused 时显示「已暂停 · 点击 ▶ 继续」（已有 StageRow，扩展到 phase 行）。
- IntakeCard / ApprovalChips 倒计时区显示「已暂停」并冻结数字，不再闪烁。
- CommandInput 的 Pause/Play 按钮在任何 phase（含 intake / thinking / running）一致可用（已就绪，复核）。

### D. 测试清单（交付前必须全过）

每一项都要"运行中点暂停→确认完全静止→等 10s→点继续→确认从断点继续"：

1. Intake 倒计时跑到一半暂停 → 数字停 → 继续后倒计时回到原数字续走。
2. 偏好分析 chat-stream 打字到一半暂停 → 文本停 → 继续后从头/或断点续打（择一稳定方案）。
3. 脚本阶段 streamLines 中暂停 → 行不再出现 → 继续后续出剩余行。
4. Wardrobe / Cast / Paint 生图中暂停 → 「Generating image」立即消失、网络面板看不到新 SSE → 继续后该 asset 重新进入生成。
5. Approval gate 倒计时中暂停 → 数字停 → 继续后续走。
6. Seedance 视频生成 + 3s 轮询中暂停 → 不再发轮询请求 → 继续后恢复轮询。
7. Retry sleep（失败后 3s 重试）中暂停 → 不重试 → 继续后立即重试。
8. 任意阶段暂停后刷新页面 → 恢复任务仍是暂停态（持久化 `paused: true`）。

### E. 持久化

`paused` 字段写进 `TaskRecord.snapshot`，恢复任务时按 paused 状态渲染 Pause/Play 按钮，restoreTask 不自动 resume。

## 不动的地方

- 不改任何业务文案 / 视觉样式 / 其它模块。
- 不重构 store 结构、不动 Workspace、Sidebar 路由。
- 仅在已点名的 runner / IntakeCard / ApprovalChips / seedance 链路内做最小改动。

## 实施顺序

1. 写 `pausableSleep / pausableFetch / pausableStreamRead / waitForResume` 原语（store 内部）。
2. 替换 chat-stream 两处 fetch。
3. 替换 retry sleep 和 seedance 轮询。
4. 改 IntakeCard / ApprovalChips 倒计时。
5. 持久化 paused。
6. 跑完测试清单 8 项 → 截图/录屏自检 → 报告给用户。
