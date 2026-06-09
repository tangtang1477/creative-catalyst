# 修复计划：项目页点击 task 后跳回首页 empty

## 目标
修复你现在遇到的问题：从项目详情页点击任意 task 后，会跳回首页，但工作区被重置成 empty，而不是恢复该任务内容。

## 我确认到的现象
- 你描述的是：**每一个 task 都会复现**。
- 复现路径是：**首次进入项目页立即点击** 和 **停留几秒后再点击** 都会出现。
- 我在代码里查到当前流程是：
  1. 项目详情页先调用 `restoreTask(taskId)`
  2. 然后 `navigate({ to: "/" })`
  3. 首页 `/` 挂载后会再执行一次 `hydrateFromStorage()`
- 这个顺序很容易导致：**刚恢复进内存的任务状态，被首页 hydration 用 localStorage 里的旧状态覆盖掉**，最终落回 empty。

## 我会怎么修

### 1. 修正首页 hydration 覆盖恢复态的问题
在 `/` 页的初始化逻辑里加保护，避免在“刚从项目页 restore 完任务”的情况下，再用 storage 把当前内存态覆盖回 empty。

会采用下面这类思路之一，并选最小改动方案：
- 如果 store 已经处于非 empty / 已有 active task，则首页不再做破坏性 hydration
- 或者只 hydration `taskHistory / viewMode / autoMode / hydrated`，不覆盖当前已恢复的活动任务上下文
- 保证进入 `/` 后，restore 出来的 `phase / taskId / taskTitle / brief / stages / assets / chatLog` 仍然保留

### 2. 补强项目页点击 task 的恢复前校验
在项目详情页点击 task 时，继续收紧恢复前判断，避免因为“列表记录存在但不可安全恢复”而把用户送回 `/` 空页。

会检查：
- 目标任务是否真实存在于当前列表 / store
- 恢复是否成功
- 只有成功恢复后才导航到 `/`

### 3. 做实际回归验证
我会按你描述的真实路径回归：
- 进入项目详情页后立即点击 task
- 进入项目详情页停留几秒再点击 task
- 验证是否仍然跳回 `/`
- 验证 `/` 打开后显示的是恢复后的任务内容，而不是 empty
- 验证不会顺带破坏 Sidebar 中已有的 task 恢复流程

## 影响范围
只改和这次问题直接相关的恢复链路：
- `src/routes/index.tsx`
- 可能涉及 `src/lib/sc/store.ts`
- 如有必要，少量调整 `src/routes/projects.$projectId.tsx`

不会顺带改别的样式、文案或功能。

## 技术细节
```text
当前高风险链路：
project detail click
  -> restoreTask(taskId) 写入 zustand 内存态
  -> navigate('/')
  -> index useEffect hydrateFromStorage()
  -> 用 localStorage 内容覆盖当前内存态
  -> phase 回到 empty
```

修复后的目标：
```text
project detail click
  -> restoreTask(taskId)
  -> navigate('/')
  -> index hydration 只补历史数据/偏好，不能覆盖当前 active task
  -> 工作区稳定展示恢复后的 task
```

## 交付结果
修完后，你从项目页点击任意 task，应当：
- 回到 `/` 工作区
- 直接看到该 task 的完整恢复内容
- 不再落回 empty 状态