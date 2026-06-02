# 实施计划

## 一、素材管理优化（MediaRail / AssetCard）

**简化分类** — 把 `wardrobe / keyframe / video / fix history` 5 个 Filter 改为 3 个：
- 图片（image）
- 视频（video）
- 音频（audio，新增）

**版本切换器** — 在原素材卡片上叠加（不新增卡片）：
- 卡片右下角显示 `v1/v2/v3...` 小圆点（≤3 个时显示点，>3 显示数字徽章）
- 鼠标悬停时左右出现 `‹ ›` 箭头切换；支持键盘左右键
- 新增修改版本时：写入原 asset 的 `versions[]`，不再生成新卡片
- 顶部右上角加一个 `v2` 角标，标识当前不是原版
- 三态完整：默认 / hover（显示箭头与版本点）/ active 切换中

## 二、音色库（VoiceLibrary，新增模块）

入口：素材区新增「音频」Tab 下方分两块——音色库 & 音频素材。

**预设音色（内置）**
- 复用 ElevenLabs 推荐声线（Sarah / Charlie / George / Laura / River / Liam / Alice 等约 12 个），存入 `seed_voices` 常量
- 每张音色卡：头像（首字母圆形）/ 名称 / 语言标签 / 试听按钮
- 试听通过新服务端函数 `previewVoice` 调用 ElevenLabs TTS（短句样本）

**用户克隆音色**
- 卡片：「+ 上传音频克隆」→ 弹窗
- 支持拖入 / 选择 30s–3min 音频（mp3/wav/m4a，≤10MB）
- 上传到 `media` bucket → 调用 `cloneVoice` 服务端函数（POST `https://api.elevenlabs.io/v1/voices/add`）→ 返回 `voice_id`
- 存入 `voices` 表，状态机：`uploading → cloning → ready / failed`
- 三态：上传中（进度条）/ 克隆中（呼吸光晕）/ 就绪（可试听+绑定角色）

**绑定到角色**
- 角色卡片底部新增「音色：[未指定 ▾]」下拉
- 选择后存入 `character_voices`（character_id + voice_id 映射）
- 后续 TTS 时按角色匹配

## 三、项目管理（Project，参考截图）

**侧边栏 — 项目分组**（图 1 样式）
- Sidebar 顶部 `项目` 折叠区，列出该用户的所有项目
- 每项：图标（投资=$ / 作业=🎓 / 写作=🖊 / 旅行=✈ / 自定义）+ 名称
- 顶部 `+ 新项目` 按钮 → 打开「创建项目」弹窗

**创建项目弹窗**（图 2 样式 1:1 还原）
- 标题「创建项目」+ 右上齿轮 + ✕
- 大输入框（占位「哥本哈根之旅」+ 左侧😊图标）
- 4 个类型 chip：投资 / 作业 / 写作 / 旅行（图标颜色按截图）
- 灰底提示卡：💡 项目功能可将聊天、文件和自定义指令集中保存…
- 右下「创建项目」按钮（disabled 直到输入有效）
- 三态：默认 / 输入聚焦 / 提交中（按钮 loading）

**项目智能引导卡**（task 列表上方）
触发条件（两者都触发）：
1. AI 检测到「第 X 集 / 下一集 / 系列 / 第二季 / 剧本」等关键词
2. 用户上传 .txt/.md/.pdf 剧本附件
3. 兜底：首次生成完成后弹一次「保存为项目？」

卡片样式：
- 圆角，左侧文件夹📁图标，标题「保存为项目，方便制作后续集数」
- 简述：自动归档本集素材、角色、音色、Brief
- 主按钮「创建项目」/ 次按钮「暂不」/ ✕ 关闭
- 三态：默认 / hover（轻微发光）/ 已关闭（不再本会话弹）

**项目详情页**（点击侧边栏项目项进入）
- 顶部：项目名 + 集数计数 + 「+ 新建一集」按钮
- 三段：剧本/Brief · 素材库（沿用 MediaRail 分类）· 历史任务
- 「+ 新建一集」预填上一集的角色、音色、风格、Brief

## 四、登录 & Lovable Cloud 持久化

- 首次访问无 session 时不强制弹登录，仅在「创建项目 / 上传音色」时引导登录
- 登录方式：邮箱密码 + Google（通过 `lovable.auth.signInWithOAuth("google")`，并同步 `configure_social_auth: ["google"]`）
- 新建 `/login` 与 `/_authenticated` 布局；`projects / project_episodes / voices / character_voices` 都在 `_authenticated` 下读写

## 五、数据库迁移

```text
projects                  # 用户项目
  id, user_id, name, kind (investment|homework|writing|travel|custom),
  icon, brief jsonb, created_at, updated_at
project_episodes          # 项目下每一集 (绑定到 video_tasks)
  id, project_id, task_id (-> video_tasks), episode_no, created_at
voices                    # 音色库
  id, user_id, source (preset|cloned),
  external_id (ElevenLabs voice_id), name, lang,
  sample_url, origin_audio_url,
  status (uploading|cloning|ready|failed), error, created_at
character_voices          # 角色 -> 音色
  id, user_id, task_id, character_name, voice_id, created_at
assets 表新增列            # 版本系
  version int default 1, parent_asset_id uuid,
  media_kind text (image|video|audio)  -- 替代旧的 stage 分类
```

全部带 RLS（`auth.uid() = user_id`），GRANT 给 `authenticated` 与 `service_role`，预设音色用全局只读策略。

## 六、Server Functions（新增）

- `src/lib/projects.functions.ts` — `listProjects / createProject / getProject / attachEpisode`
- `src/lib/voices.functions.ts` — `listVoices / cloneVoice / previewVoice / deleteVoice`
- `src/lib/characters.functions.ts` — `setCharacterVoice`
- 所有函数都用 `requireSupabaseAuth`，ElevenLabs 调用从 `process.env.ELEVENLABS_API_KEY` 读取（需用户提供）

## 七、技术说明

- ElevenLabs API Key：需要用户提供 `ELEVENLABS_API_KEY`，否则音色试听/克隆不可用，UI 会显示「请配置音色服务」占位
- 文件上传到 `media` bucket（已存在），新增 `voices/{user_id}/` 路径
- 所有新 UI 严格使用 `src/styles.css` 的语义 token；三态（默认/hover/active 或 loading/error/empty）全部实现
- 截图样式按 1:1 还原：圆角 12px、chip 间距 8px、提示卡灰底（`bg-surface-2`）

## 八、需要用户提供的密钥

- `ELEVENLABS_API_KEY` — 用于音色试听与克隆（创建项目和项目管理本身不依赖它）

确认后我将先创建数据库迁移并请求该密钥。