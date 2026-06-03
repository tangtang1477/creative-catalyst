1. 修复图 1：把“历史项目恢复”从素材级恢复升级为任务级可继续运行恢复
- 改造历史回填逻辑，让回填出的 task snapshot 不只包含 assets，还补齐可继续操作所需的运行上下文：
  - `script.shots` 与每个视频段的 `sourceShotId`
  - `life` / `details` 阶段的完整 `stageSnapshots`
  - 失败态所需的 `errorMessage` / `errorCode` / `failureReason`
  - 可重做视频段所需的段时长、poster、shot 关联
- 调整 `restoreTask`：
  - 区分“失败任务恢复”与“历史归档恢复”两类场景
  - 失败任务恢复后保留对应失败阶段与重做 action
  - 历史归档恢复后，如果已有可推断的 life/video 上下文，就允许对单段视频继续“重试/重做”而不是只读展示
- 调整项目恢复后的主工作区展示：
  - 不再只显示一句“已恢复 N 个素材”
  - 对历史项目展示完整项目摘要、已恢复镜头/分段、失败原因和可执行入口
  - 让“重做此步 / 重做此段”只依赖恢复后的真实 stage/asset 状态，而不是当前临时运行态

2. 重做图 2：点击项目进入独立“项目详情页”，再从详情页进入具体 task
- 新增独立路由，例如项目详情页：
  - 首页保留“我的项目”入口，但点击项目后不再直接 `restoreTask(latest)`
  - 改为进入项目详情页，展示该项目下全部 tasks
- 项目详情页信息结构：
  - 顶部：项目名、类型、创建/更新时间、任务总数
  - 主列表：该项目下所有 task，按时间倒序，展示状态、日期、标题、已生成镜头/素材数量、失败原因摘要
  - 点击某个 task 后，再进入该 task 的具体工作区恢复视图
- 主页中的 `ActiveProjectBanner` 改为轻量项目上下文提示，不再承担 task 列表主入口职责
- Sidebar / HomeProjectsRow / 项目横幅三个入口统一到同一导航逻辑，避免现在“一个入口直接恢复 task、一个入口只是 banner”的不一致行为

3. 改造剧本上传流程：上传后先存入待处理状态，不立即解析
- 现在上传剧本后会立刻 `parseScriptText` 并直接 `importGeneratedScript`，这会被改掉。
- 新流程改为：
  - 上传 `.txt/.md/.docx/.pdf` 后，只做文件读取/抽取文本
  - 把“原始剧本文本 + 文件名 + 来源”存入 store 的待处理剧本状态
  - UI 显示“已上传剧本，等待你的指令”而不是立即进入 structure ready
- 用户随后在输入框里补充 prompt（例如“按这个剧本做 9:16 连续剧第一集，节奏更悬疑”）时：
  - `submit()` 把用户 prompt 与待处理剧本文本一起传给真实后端
  - 后端按“剧本原文 + 用户意图”做结构化解析
  - 解析结果进入当前任务的 `script`
  - 后续流程直接进入“依据上传剧本输出”的规划链路，而不是再调用通用 `generateScript`

4. 接入真实后端：把“基于上传剧本规划”做成独立服务端函数
- 新增真实后端 server function，用于：
  - 输入：`scriptText`、`briefHint/prompt`、必要的格式/风格参数
  - 输出：与当前前端兼容的 `GeneratedScript`
- 这个函数会严格以上传剧本为主，不二次编新故事，只按用户 prompt 调整：
  - 节奏/时长压缩
  - 风格导向
  - 镜头组织方式
  - 输出规格适配
- `runStructure()` 中增加分支：
  - 如果当前任务存在“待处理剧本”，则走“上传剧本解析函数”
  - 否则才走原来的 `generateScript`
- 保证所有参数是真实从前端传到后端，而不是本地假灌数据

5. 需要改动的主要文件
- 路由/页面：
  - `src/routes/index.tsx`
  - 新增项目详情 route 文件
- 项目入口与展示：
  - `src/components/sc/Workspace.tsx`
  - `src/components/sc/Sidebar.tsx`
  - 可能新增项目详情组件
- 状态管理：
  - `src/lib/sc/store.ts`
  - `src/lib/sc/types.ts`
  - `src/lib/sc/projects-store.ts`
- 后端函数：
  - `src/lib/tasks.functions.ts`
  - `src/lib/script-parse.functions.ts`
  - 可能新增“按上传剧本+用户意图解析”的 server function
- 上传入口：
  - `src/components/sc/AttachMenu.tsx`
  - `src/components/sc/CommandInput.tsx`

6. 技术说明
- 当前问题的根因不是单一 UI 文案，而是三条链路混在一起：
```text
项目点击 -> 直接恢复最新 task
历史回填 -> 只恢复到素材层，不足以继续“重做”
上传剧本 -> 立即解析，没等用户补充意图
```
- 本次会把它拆成三条明确链路：
```text
项目点击 -> 项目详情页 -> 选择 task -> 恢复 task
上传剧本 -> 暂存原文 -> 用户补 prompt -> 后端解析 -> 进入结构规划
历史恢复 -> 恢复完整 task 上下文 -> 允许继续重做/重跑
```
- 不涉及现在就改数据库表；优先在现有任务快照与前端状态模型上补齐。如果实施过程中发现项目详情页必须做服务端分页或额外 project-task 汇总，再补最小必要后端读取逻辑。