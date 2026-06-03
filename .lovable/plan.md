# 修复计划

## 目标
把你指出的 8 个问题拆成三层一起修：
1. 先修“显示与数据不一致”问题；
2. 再把“角色三视图 + 音色绑定/试听/换音色”做成真正可用；
3. 最后重构 chat agent、QC 和 reference-image-to-video 的失败兜底，避免再次出现“看起来做了，实际上没生效”。

## 我会改什么

### 1. 积分与项目历史
- 把 `Boost speed` 从假入口改成真实扣费入口：点击一次立即消费 **2000 积分**，并统一 toast、余额、hover 卡、圆环显示。
- 明确区分“充值入口”和“加速入口”，避免现在两个 `Get` 看起来一样但一个根本没逻辑。
- 修复项目历史只存在 `localStorage` 的问题：
  - 现在项目页只能恢复“本机本浏览器的本地任务快照”；
  - 我会把项目重新进入逻辑改成优先读后端任务/素材，而不是只看本地缓存。
- 补齐项目再次查看能力：进入项目时能看到该项目下已完成任务，而不是出现“暂无本地历史内容”就像丢了。

### 2. 角色图改成三视图 + 音色卡片内联
- 把 `cast` 阶段的人物素材从单张头像/半身参考，改成 **角色三视图**（正面 / 侧面 / 背面）输出逻辑。
- 角色素材卡片不再只显示图片：
  - 在角色卡片下方直接显示当前绑定音色；
  - 支持试听；
  - 支持更换音色；
  - 没绑定时显示可选音色下拉或选择器。
- 修复“角色出现了但音色没一起出现”问题：
  - 现在自动绑定只写进 `character_voices`，但 UI 读取条件不对；
  - 我会把绑定关系改成按 **cast 角色资产** 正确命中，而不是仍按 wardrobe 的 `W*` 逻辑找。
- 修复“音色库没有东西”的表现问题：
  - 后端其实已经有 `voices` 和 `character_voices`；
  - 但前端入口和角色卡联动没有打通，我会把音色库、角色绑定、卡片试听做成同一条链路。

### 3. chatbox / agent 变成真正影响生成的智能代理
- 现在 chatbox 只是生成一段回复文本，**不会真正改动 brief / script / asset prompt / rerun plan**，所以你说什么都不会影响最终输出。
- 我会把 agent 改成“可执行指令入口”：
  - 能识别用户是在改主角、改性别、改场景、改风格、改单镜头；
  - 将变更写回 store 中的结构化状态；
  - 自动判断需要重跑哪一段（cast / paint / qc / life）；
  - 把重跑影响明确展示出来，而不是只回复一句话。
- 针对你图 3 的场景，我会让“变为女性”这类指令真正进入人物设定，并触发后续素材失效与重生成。

### 4. QC 从“展示结果”升级为“真检测 + 真约束”
- 现在 QC 确实调用了多模态检查，但它的问题是：
  - 只检查 `paint` 关键帧；
  - 修图时只拿 wardrobe + 当前镜头旧图作为参考；
  - **没有把 cast 角色三视图 / 场景参考图一起作为强约束输入**，所以修完仍会人物不一致。
- 我会把 QC 修复链路升级成：
  - 检测时同时参考 cast 角色素材、场景素材、关键帧；
  - 修复时把对应角色三视图 + 场景参考 + 原关键帧一并送入图像编辑；
  - QC 面板里区分“检测通过 / 检测未通过 / 已修复待复检 / 复检失败”。
- 最终做到图 4 不是只是绿条展示，而是真正约束后续修图结果。

### 5. reference-image-to-video 全失败的根因修复
- 我已经定位到你这次全失败的直接原因：
  - 送给视频接口的 `image_urls` 里包含真人角色图；
  - 上游直接返回 `PrivacyInformation`；
  - 另一些图又触发 `PolicyViolation`；
  - 当前代码是 3 段并发一起提，结果就会出现“全部失败”。
- 我会把视频阶段改成更稳的策略：
  - 在提交前先做参考图分级，区分“真人角色参考 / 场景参考 / 道具参考”；
  - 对容易触发隐私/版权拦截的参考图，先做脱敏替代策略，而不是直接原图送上游；
  - 每一段失败时返回**可读失败原因 + 对应参考图类型**；
  - 增加段级 fallback，不再让 1 个策略错误拖死全部分段；
  - 失败后提供“改用场景图重试 / 改用非真人角色参考重试 / 仅用关键帧重试”这类明确操作。
- 同时把“未扣积分”与失败原因展示统一化，避免用户只能看到一大串原始报错 JSON。

## 具体文件范围
- `src/lib/sc/store.ts`
- `src/lib/sc/types.ts`
- `src/lib/sc/projects-store.ts`
- `src/lib/video-tasks.functions.ts`
- `src/lib/seedance.functions.ts`
- `src/lib/voices.functions.ts`
- `src/lib/sc/voices-store.ts`
- `src/lib/sc/character-voices-store.ts`
- `src/components/sc/UserHoverCard.tsx`
- `src/components/sc/Workspace.tsx`
- `src/components/sc/AssetCard.tsx`
- `src/components/sc/VoiceLibraryPanel.tsx`
- `src/components/sc/CharacterVoiceBinding.tsx`
- `src/components/sc/QCPanel.tsx`
- `src/components/sc/ChatAgentMessage.tsx`
- `src/routes/api/chat-stream.ts`
- 以及必要时补 1 个数据库 migration（如果要把项目任务历史真正持久化到后端而不是只靠本地缓存）

## 技术说明
- 目前真正的问题不是“后端完全没搭”，而是“有表、有 server fn，但没接进主流程”：
  - `voices` / `character_voices` 已存在；
  - ElevenLabs 试听/克隆接口也存在；
  - 但角色卡读取还是旧条件，导致你看不到正确音色。
- 项目内容“看不到历史”不是内容消失，而是当前项目页恢复逻辑主要依赖 `localStorage taskHistory`，所以换设备/清缓存/没本地记录时就像没了。
- reference-image-to-video 全失败不是积分问题，而是上游安全拦截：你贴出来的 `PrivacyInformation` / `PolicyViolation` 都是真实上游返回，不是前端伪造状态。

## 交付顺序
1. 修积分入口与项目历史恢复。
2. 修角色三视图、角色卡内联音色试听/换音色。
3. 修 agent 指令真正落库到生成状态。
4. 修 QC 强约束与复检。
5. 修视频阶段拦截规避、段级 fallback 与失败展示。

## 验收结果
完成后你会得到：
- `Boost speed` 点击一次就真实扣 2000 积分；
- 项目做完后可再次进入查看，不依赖单机本地缓存；
- 角色素材是三视图；
- 角色卡下方直接试听/切换音色；
- chatbox 改指令会真实影响后续生成；
- QC 修完后会复检，不再只是展示绿条；
- reference-image-to-video 不会再因为同类敏感参考图策略错误而整批一起失败。