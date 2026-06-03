1. 先修首屏 hydration 崩溃源头
- 重点处理所有 SSR 首次渲染与客户端 localStorage 状态不一致的组件，优先是 `Sidebar.tsx`、`UserHoverCard.tsx`、`CreditRing.tsx`、`CreditsHoverPanel.tsx`、`LowCreditToast.tsx`、`Workspace.tsx`。
- 把会直接参与首屏文本/属性输出的客户端状态改成 mounted/hydrated 后再渲染，避免服务端默认值与客户端真实值不一致触发 React 418。
- 特别清理这些高风险点：
  - `useCredits` 读 localStorage 后直接渲染余额/积分文案
  - `Sidebar` 里用 `Date.now()` 伪造 active task 时间
  - 所有 `aria-label`、文本节点、数字余额、时间字符串在 SSR 与 CSR 的差异

2. 修复 task 恢复链路的两个入口
- 保持项目详情页 `handleOpenTask` 的安全校验，并继续确保点击后进入 `/` 工作区。
- 修复 Sidebar 的 task 点击链路：恢复任务后必须稳定导航回 `/`，且不能在 hydration 尚未稳定时渲染出与客户端不同的 task 文本结构。
- 继续加固 `restoreTask`，确保历史残缺数据不会在恢复后把首页工作区渲染炸掉。

3. 清理会诱发 hydration mismatch 的动态展示
- 统一处理所有时间文本：只在 mounted 后显示，并保留 `suppressHydrationWarning`。
- 对积分余额、最近消费、动态进度条、任务计数等首屏动态值，改为客户端挂载后再显示或提供 SSR/CSR 一致的占位内容。
- 对 hover card / toast / dialog 这类客户端交互内容，避免在 SSR 首帧输出依赖本地状态的文案。

4. 补足防回归边界
- 保留并完善 `index.tsx`、`projects.$projectId.tsx`、`__root.tsx` 的错误边界，避免再次表现为“白屏/闪退”。
- 把这次新增的规则补进记忆：凡是本地存储驱动的展示值，不允许直接参与 SSR 首屏文本输出。

5. 按你提供的真实路径做回归验证
- 用预览实际复现并验证：从项目详情页点 task、从 Sidebar 点失败 task、返回首页后是否正常进入工作区。
- 重点确认不再出现 React 418、页面不再白屏、失败 task 仍可恢复到 Gallery/工作区。

技术细节
- 预计修改文件：
  - `src/components/sc/Sidebar.tsx`
  - `src/components/sc/UserHoverCard.tsx`
  - `src/components/sc/credits/CreditRing.tsx`
  - `src/components/sc/credits/CreditsHoverPanel.tsx`
  - `src/components/sc/credits/LowCreditToast.tsx`
  - `src/components/sc/Workspace.tsx`
  - `src/lib/sc/store.ts`
  - `src/routes/index.tsx`
  - `src/routes/projects.$projectId.tsx`
- 这次修复目标不是只“让点击能跳转”，而是同时解决：
  - task 点击入口恢复正确
  - React 418 hydration mismatch
  - 残缺历史任务恢复安全
  - 首屏不再间歇性白屏