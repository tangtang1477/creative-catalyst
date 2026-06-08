import { requireUserFromRequest } from "@/lib/sc/server-auth";

export async function handleChatStream(request: Request): Promise<Response> {
const auth = await requireUserFromRequest(request);
if (auth instanceof Response) return auth;



const key = process.env.LOVABLE_API_KEY;
if (!key) {
  return new Response("Missing LOVABLE_API_KEY", { status: 500 });
}


let body: {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "chat" | "preflight-options";
  context?: {
    phase?: string;
    brief?: {
      prompt?: string;
      adType?: string;
      format?: string;
      visualSource?: string;
    };
    script?: {
      mood?: string;
      shots?: Array<{ shot: string; duration: string; scene: string }>;
    };
    assets?: Array<{
      id: string;
      label?: string;
      caption?: string;
      kind?: "image" | "video";
      stageId?: string;
      hasUrl?: boolean;
    }>;
    stages?: Array<{ id: string; status: string }>;
    failedStage?: string;
    runningStage?: string;
    taskTitle?: string;
    refs?: Array<{ id: string; kind?: string; name?: string; url?: string; assetId?: string }>;
  };
};
try {
  body = (await request.json()) as typeof body;
} catch {
  return new Response("Invalid JSON body", { status: 400 });
}

const messages = Array.isArray(body.messages) ? body.messages : [];
const mode = body.mode ?? "chat";
if (!messages.length && mode === "chat") {
  return new Response("messages required", { status: 400 });
}

const ctx = body.context;
const ctxLines: string[] = [];
if (ctx?.phase) ctxLines.push(`当前阶段：${ctx.phase}`);
if (ctx?.taskTitle) ctxLines.push(`任务名：${ctx.taskTitle}`);
if (ctx?.brief?.prompt) ctxLines.push(`用户需求：${ctx.brief.prompt}`);
if (ctx?.brief?.adType) ctxLines.push(`视频类型：${ctx.brief.adType}`);
if (ctx?.brief?.format) ctxLines.push(`规格：${ctx.brief.format}`);
if (ctx?.script?.mood) ctxLines.push(`情绪：${ctx.script.mood}`);
if (ctx?.failedStage) ctxLines.push(`失败阶段：${ctx.failedStage}（建议用 actions.retry-stage 或 resume-from）`);
if (ctx?.runningStage) ctxLines.push(`中断时停留阶段：${ctx.runningStage}（可用 actions.resume-from 续跑）`);
if (ctx?.stages?.length) {
  ctxLines.push("阶段状态：" + ctx.stages.map((st) => `${st.id}=${st.status}`).join("，"));
}
if (ctx?.script?.mood) ctxLines.push(`情绪：${ctx.script.mood}`);
if (ctx?.script?.shots?.length) {
  ctxLines.push(
    "已生成镜头：" +
      ctx.script.shots
        .map((s) => `${s.shot}(${s.duration}) ${s.scene}`)
        .join("； "),
  );
}
if (ctx?.assets?.length) {
  // 让模型能正确写 imageEdits.assetId
  const readyAssets = ctx.assets.filter((a) => a.hasUrl).slice(0, 40);
  if (readyAssets.length) {
    ctxLines.push(
      "已生成素材（可被 imageEdits 引用）：" +
        readyAssets
          .map(
            (a) =>
              `${a.id}[${a.kind ?? "image"}/${a.stageId ?? "?"}]${a.caption ? " " + a.caption : a.label ? " " + a.label : ""}`,
          )
          .join("；"),
    );
  }
}
if (ctx?.refs?.length) {
  ctxLines.push(
    "用户引用素材（必须在 imageEdits.assetId 中使用这些 id）：" +
      ctx.refs
        .map(
          (r) =>
            `${r.assetId ?? r.id}(${r.kind ?? "asset"})${r.name ? " " + r.name : ""}`,
        )
        .join("；"),
  );
}



// ===== Preflight options 分支：让模型直接产出 JSON 问题卡 =====
if (mode === "preflight-options") {
  const adType = ctx?.brief?.adType ?? "";
  const isSeries = /series|剧集|连续剧|剧\b/i.test(adType);
  const q1Rule = isSeries
    ? '- 第 1 题=时长 + 集数（例如 "1 集 × 15 秒"、"3 集 × 30 秒"）；'
    : '- 第 1 题=单条视频时长（如 "15s / 30s / 60s"）；**严禁**出现"集数 / 多少集 / 系列 / EP"等词；';
  const preflightSys = [
    "你是 Vibe Aideo 的 AI 广告导演。用户刚确认了一个视频 brief，",
    "现在请你**主动**提出 3 个关键创意选择题，让用户点选而不是自己输入。",
    "严格输出 JSON（不要 markdown 代码块），形如：",
    '{"intro":"…一句话开场 + 直接告诉用户「请点选下面几个偏好，选完点 Continue 我就开始制作」…","questions":[',
    '  {"id":"duration","label":"…","options":[{"id":"opt1","label":"…"},…],"allowOther":true},',
    '  {"id":"tone","label":"…","options":[…],"allowOther":true},',
    '  {"id":"style","label":"…","options":[…],"allowOther":true}',
    '],"outro":""}',
    "要求：",
    "- intro 必须把「请点选 + 点 Continue 开始」的**操作指引**写清楚，因为前端会把 intro 渲染在选项**上方**；",
    "- outro 默认留空字符串。只有当确实有必要补充说明（例如「可以选多个」「跳过将走默认值」）时才写一句，且不要重复 intro 的指引；",
    "- 每题 3–4 个选项，选项 label 控制在 14 字以内，可在括号里补充细节；",
    "- 问题必须紧扣用户的 prompt（古风短剧就别问 \"是否需要英文配音\"）；",
    q1Rule,
    "- 第 2 题=情绪/调性；第 3 题=视觉风格或主角方向；",
    "- intro/outro 用中文，自然口语，不要 markdown；",
    "- 全文只输出 JSON，不要任何额外文字。",
    `\n—— 当前内容类型 ——\n${isSeries ? "连续剧（可问集数）" : "非连续剧（禁止问集数）"}`,
    ctxLines.length ? "\n—— 当前任务上下文 ——\n" + ctxLines.join("\n") : "",
  ].filter(Boolean).join("\n");


  const userMsg = messages.length
    ? messages[messages.length - 1].content
    : ctx?.brief?.prompt ?? "";

  const json = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: preflightSys },
          { role: "user", content: userMsg || "请基于上下文给出选项" },
        ],
      }),
      signal: request.signal,
    },
  );

  if (!json.ok) {
    const detail = await json.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `http_${json.status}`, detail: detail.slice(0, 300) }),
      { status: json.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const data = (await json.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const raw = data?.choices?.[0]?.message?.content ?? "";
  let parsed: { intro?: string; outro?: string; questions?: unknown[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const intro = typeof parsed.intro === "string" && parsed.intro.trim()
    ? parsed.intro
    : "好的，先确认几个关键方向 —— 请在下方点选偏好，选完点 Continue 我就开始制作。";
  const outro = typeof parsed.outro === "string" ? parsed.outro : "";

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        );
      };
      // 引导语和"选完点继续"全部塞进 card 内部，由 ChatOptionCard
      // 分别渲染在选项上方 / 下方，避免文字位置和选项不在一起。
      emit("option-card", {
        id: `oc_${Date.now().toString(36)}`,
        questions,
        intent: "preflight",
        fallback: questions.length === 0,
        intro: questions.length > 0 ? intro : undefined,
        outro: questions.length > 0 ? outro : undefined,
      });
      emit("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
// ===== 常规 chat 分支继续往下走 =====

const PHASES = [
  { id: "intent", label: "理解用户需求" },
  { id: "context", label: "匹配当前镜头与品牌" },
  { id: "plan", label: "评估改动范围" },
  { id: "reply", label: "生成回复" },
] as const;

const systemPrompt = [
  "你是 Vibe Aideo 的 AI 广告导演助手。**无论用户消息多短，都必须先完整输出 `<thinking>...</thinking>` 思考块、且思考块内必须含全部 3 个 `## ` 小节，缺一不可。** 然后再输出最终回复。pipeline 指令必须严格用 `<directives>{...}</directives>` 包裹，**禁止把任何 JSON（如 `{\"actions\":...}` / `{\"patch\":...}`）裸写在 thinking 块外的回复正文里**。请按以下严格格式输出，不要省略任何标签：",
  "",
  "<thinking>",
  "## 理解用户需求",
  "（一句话总结用户这次说的核心诉求）",
  "## 匹配当前镜头与品牌",
  "（结合下方任务上下文，列出涉及的镜头编号 / 品牌方向，没有就说 \"暂无相关上下文\"）",
  "## 评估改动范围",
  "（一句话说明会影响哪些阶段：脚本 / 关键帧 / 视频片段；若不需要重渲染就说 \"无需重渲染\"）",
  "</thinking>",
  "",
  "（接着直接输出给用户的最终回复，中文，简洁专业，不超过 120 字，不要 markdown 标题，不要再出现 <thinking> 标签）",
  "",
  "**指令协议（重要）**：如果用户的话**明确要求改动**当前 brief / 脚本 / 角色 / 场景（例如\"把女主换成男主\"\"场景改成雨夜地铁\"\"时长改成 30 秒\"），或者要求**继续 / 续跑 / 重做 / 再来一集**这类驱动 pipeline 的动作，在回复正文之后追加一个 `<directives>...</directives>` JSON 块（不要 markdown 代码块），schema：",
  '{"patch":{"brief":{"prompt"?:string,"adType"?:string,"format"?:string},"script":{"mood"?:string,"shots"?:[{"shot":string,"duration"?:string,"scene"?:string,"motion"?:string,"elements"?:string,"prompt"?:string}]},"characters":[{"id":string,"name"?:string,"look"?:string}],"scenes":[{"id":string,"name"?:string,"description"?:string}]},"rerun":["script"|"wardrobe"|"cast"|"paint"],"imageEdits":[{"assetId":string,"prompt":string,"refs"?:string[]}],"actions":[{"kind":"retry-stage","stageId":"scene|structure|wardrobe|cast|paint|qc|life|details"}|{"kind":"resume-from","stageId"?:"..."}|{"kind":"rerun-all","prompt"?:string}|{"kind":"generate-next-episode","prompt":string}]}',
  "- 只输出**真正需要改动**的字段，无须改动就**完全不要**输出 <directives> 标签。",
  "- rerun 数组只能用于「用户明确说要**重新生成 / 重画 / 重做**某阶段」的场景。",
  "- 用户说「合并/拆分/调整时长/改时长/微调/再润色/把 A0X 改成…/把 brief.format 改成 30s 9:16」这类**局部 patch**，必须**只输出 patch**，rerun **留空数组或不输出**——否则会清空用户已生成的关键帧 / 视频片段。",
  "- 不要为同一改动同时输出 brief.format 微调和 rerun:[\"script\"]。format / shots 字段微调由前端直接应用，不需要重跑 script 阶段。",
  "- 仅当用户说「重新分镜 / 整套服装重画 / 角色重做 / 关键帧重出」这种破坏性请求时，才允许出现对应 rerun。",
  "- **imageEdits**：当用户对某张**已生成的具体图片**（关键帧 A0X / 角色 W0X / 服装 P0X / 人物 C0X）说\"把这张改成…/给它加…/换背景…/改成雨夜\"等局部改图诉求时，使用 imageEdits 而**不要**用 rerun；assetId 必须从上下文「已生成素材」列表中精确选取，禁止瞎编 id；refs 可填同列表中的其它 id（角色/道具参考），最多 4 个。",
  "- imageEdits 与 rerun **不要同时输出**；与 patch 可以共存（例如修脚本里 A03 的 prompt 同时把现有 A03 关键帧真改图）。",
  "- **actions（重要）**：",
  "  · 用户说「从这一步继续 / 接着上次跑 / 把中断的接着做完」→ `actions:[{\"kind\":\"resume-from\"}]`；如能从上下文判断到具体阶段，再加 stageId。",
  "  · 用户说「重做关键帧 / 重新跑视频 / 把 life 阶段再来一次」→ `actions:[{\"kind\":\"retry-stage\",\"stageId\":\"paint|life|..\"}]`。",
  "  · 用户说「整任务重跑 / 推倒重来 / 全部重新生成」→ `actions:[{\"kind\":\"rerun-all\"}]`（可选 prompt 覆写）。",
  "  · 用户说「再来一集 / 下一集做 X / 续写第二集」→ `actions:[{\"kind\":\"generate-next-episode\",\"prompt\":\"...这一集的具体诉求...\"}]`。",
  "  · actions 与 rerun **不要同时输出**；触发 actions 时 patch / imageEdits 也通常不应出现（会被清空）。",
  "  · 只有用户**明确表达**了上述意图才输出 actions；模糊的「再看看 / 这个不错」不要触发。",
  "- JSON 之外不要任何额外字符。",
  "",
  "规则：每个 ## 小节只写 1-2 行；最终回复必须紧扣用户输入，禁止套用 YSL/巴黎/丝绒 等无关案例。",
  ctxLines.length ? "\n—— 当前任务上下文 ——\n" + ctxLines.join("\n") : "",
]
  .filter(Boolean)
  .join("\n");

const upstreamCtrl = new AbortController();
const upstreamTimeout = setTimeout(() => upstreamCtrl.abort(), 45_000);
request.signal?.addEventListener("abort", () => upstreamCtrl.abort());
let upstream: Response;
try {
  upstream = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
      signal: upstreamCtrl.signal,
    },
  );
} catch (err) {
  clearTimeout(upstreamTimeout);
  const msg = err instanceof Error ? err.message : "upstream_fetch_failed";
  return new Response(
    JSON.stringify({ error: "upstream_unreachable", detail: msg.slice(0, 300) }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}
clearTimeout(upstreamTimeout);

if (!upstream.ok || !upstream.body) {
  const text = await upstream.text().catch(() => "");
  const status = upstream.status;
  const code =
    status === 429
      ? "rate_limited"
      : status === 402
        ? "payment_required"
        : `http_${status}`;
  return new Response(
    JSON.stringify({ error: code, detail: text.slice(0, 300) }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

const encoder = new TextEncoder();
const stream = new ReadableStream<Uint8Array>({
  async start(controller) {
    const emit = (event: string, data: unknown) => {
      controller.enqueue(
        encoder.encode(
          `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
        ),
      );
    };

    // 1) 立刻 push 4 个 phase 占位
    for (const p of PHASES) emit("phase", p);

    // 2) 进入 intent 阶段
    let currentPhaseIdx = 0;
    const phaseStart = (idx: number) => {
      if (idx >= PHASES.length) return;
      emit("phase-start", { id: PHASES[idx].id });
    };
    const phaseDone = (idx: number, summary: string) => {
      if (idx >= PHASES.length) return;
      emit("phase-done", {
        id: PHASES[idx].id,
        summary: summary.trim().slice(0, 200),
      });
    };
    phaseStart(0);

    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuf = "";
    let fullText = "";
    let inThinking = false;
    let thinkingStartedAt = 0;
    // 用于检测 <thinking> 起始标签
    let pendingHead = "";
    // 当前 thinking 小节累积的内容
    let sectionBuf = "";
    let lastSectionFlushIdx = -1;
    let replyAcc = "";
    // directives 抑制：reply 阶段一旦看到 <directives>，后续 token 不再 emit
    let replyTail = "";
    let directivesOpen = false;

    const emitReplyToken = (chunk: string) => {
      if (!chunk) return;
      if (directivesOpen) {
        replyAcc += chunk;
        return;
      }
      const combined = replyTail + chunk;
      const openIdx = combined.indexOf("<directives>");
      // 裸 JSON 兜底：模型偶尔会忘记 <directives> 包裹，直接吐 `{"actions":...}` /
      // `{"patch":...}` 等。命中后从该 `{` 处截断，后续内容全部进 replyAcc 待最后解析。
      const bareIdx = combined.search(
        /\{[\s\S]{0,40}"(actions|patch|rerun|imageEdits)"/,
      );
      const cutIdx =
        openIdx >= 0 && (bareIdx < 0 || openIdx <= bareIdx) ? openIdx : bareIdx;
      if (cutIdx >= 0) {
        const visible = combined.slice(0, cutIdx);
        if (visible) emit("token", { text: visible });
        replyTail = "";
        replyAcc += combined; // 保留全量
        directivesOpen = true;
        return;
      }
      // 保留最后 SAFE 个字符在 tail，避免 "<directives" / `{"actions` 跨 chunk 漏判
      const SAFE = 24;
      if (combined.length > SAFE) {
        const visible = combined.slice(0, combined.length - SAFE);
        emit("token", { text: visible });
        replyAcc += visible;
        replyTail = combined.slice(combined.length - SAFE);
      } else {
        replyTail = combined;
      }
    };

    const flushReplyTail = () => {
      if (!directivesOpen && replyTail) {
        emit("token", { text: replyTail });
        replyAcc += replyTail;
        replyTail = "";
      }
    };


    const flushSection = (idx: number) => {
      if (idx <= lastSectionFlushIdx) return;
      const text = sectionBuf.trim();
      if (text) {
        phaseDone(idx, text.split(/\n/)[0] ?? text);
      } else {
        phaseDone(idx, "（无说明）");
      }
      lastSectionFlushIdx = idx;
      sectionBuf = "";
    };

    const handleNewContent = (chunk: string) => {
      if (!chunk) return;
      fullText += chunk;

      let remaining = chunk;
      while (remaining.length > 0) {
        if (!inThinking) {
          // 还没进 thinking：找 <thinking>
          if (!thinkingStartedAt) {
            pendingHead += remaining;
            const openIdx = pendingHead.indexOf("<thinking>");
            if (openIdx >= 0) {
              // 进入 thinking
              inThinking = true;
              thinkingStartedAt = Date.now();
              const after = pendingHead.slice(
                openIdx + "<thinking>".length,
              );
              pendingHead = "";
              remaining = after;
              continue;
            }
            // 还没出现 <thinking> 标签，继续等
            return;
          } else {
            // 已经离开 thinking → 全部是 reply token
            emitReplyToken(remaining);
            return;
          }
        }

        // 在 thinking 内：找 </thinking>
        const closeIdx = remaining.indexOf("</thinking>");
        const slice =
          closeIdx >= 0 ? remaining.slice(0, closeIdx) : remaining;

        if (slice) {
          sectionBuf += slice;
          emit("thinking", { text: slice });

          // 根据 sectionBuf 中的 ## 小节切换 phase
          // PHASES[0..2] 对应 3 个小节，依次完成前一个开启下一个
          const sections = sectionBuf.split(/\n##\s*/);
          // sections 数量 = 已开始的小节数（首段为 "" 或 leading 空白）
          // currentPhaseIdx 取值范围 0..2（reply 在 thinking 外）
          // 当 sections.length-1 > currentPhaseIdx 时说明新一个 ## 出现，
          // 收尾上一段并开下一段
          const reached = Math.min(sections.length - 1, 2);
          if (reached > currentPhaseIdx) {
            // 上一段的正文 = sections[currentPhaseIdx] 去掉首行标题（# 后第一行已被去掉）
            const prevBody = sections[currentPhaseIdx] ?? "";
            // 临时把 sectionBuf 替换成"上一段的内容"用于 summary
            const savedBuf = sectionBuf;
            sectionBuf = prevBody;
            flushSection(currentPhaseIdx);
            sectionBuf = savedBuf;
            currentPhaseIdx = reached;
            phaseStart(currentPhaseIdx);
          }
        }

        if (closeIdx >= 0) {
          // 收尾最后一个 thinking 小节
          const sections = sectionBuf.split(/\n##\s*/);
          const lastBody = sections[currentPhaseIdx] ?? "";
          const savedBuf = sectionBuf;
          sectionBuf = lastBody;
          flushSection(currentPhaseIdx);
          sectionBuf = savedBuf;

          inThinking = false;
          // 进入 reply 阶段
          currentPhaseIdx = 3;
          phaseStart(3);
          remaining = remaining.slice(closeIdx + "</thinking>".length);
          continue;
        }

        return;
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lines = sseBuf.split(/\r?\n/);
        sseBuf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) handleNewContent(delta);
          } catch {
            /* ignore malformed line */
          }
        }
      }

      // 流结束兜底：若还没切到 reply，把剩余按内容补齐
      if (inThinking) {
        inThinking = false;
        flushSection(currentPhaseIdx);
        currentPhaseIdx = 3;
        phaseStart(3);
        // 没有 reply 正文：把整段 fullText 当 fallback
        if (!replyAcc) {
          const fallback =
            fullText.replace(/<\/?thinking>[\s\S]*?<\/thinking>/g, "")
              .trim() || "（AI 没有返回正文）";
          replyAcc = fallback;
          emit("token", { text: fallback });
        }
      } else if (currentPhaseIdx < 3) {
        // 模型没有按格式输出 thinking，所有内容当 reply
        for (let i = currentPhaseIdx; i < 3; i++) {
          phaseStart(i);
          phaseDone(i, "（跳过）");
        }
        currentPhaseIdx = 3;
        phaseStart(3);
        if (!replyAcc) {
          replyAcc = fullText.trim() || "（AI 没有返回正文）";
          emit("token", { text: replyAcc });
        }
      }

      // 把可能滞留的 reply tail flush 出去
      flushReplyTail();

      // 解析 directives 块（如果有）并 emit
      let dirEmitted = false;
      const dirMatch = fullText.match(/<directives>([\s\S]*?)<\/directives>/);
      if (dirMatch) {
        try {
          emit("directives", JSON.parse(dirMatch[1].trim()));
          dirEmitted = true;
        } catch (e) {
          console.warn("[chat-stream] directives JSON parse failed", e);
        }
      }
      // 裸 JSON 兜底解析：模型忘记 <directives> 包裹时
      if (!dirEmitted) {
        const bareMatch = fullText.match(
          /\{[\s\S]{0,40}"(actions|patch|rerun|imageEdits)"[\s\S]*\}\s*$/,
        );
        if (bareMatch) {
          try {
            emit("directives", JSON.parse(bareMatch[0]));
          } catch (e) {
            console.warn("[chat-stream] bare directives parse failed", e);
          }
        }
      }

      // replyAcc 用于 summary，去掉 directives 块（含 <directives> 标签 和 裸 JSON 尾部）
      const cleanReply = replyAcc
        .replace(/<directives>[\s\S]*?<\/directives>/g, "")
        .replace(/\{[\s\S]{0,40}"(actions|patch|rerun|imageEdits)"[\s\S]*\}\s*$/g, "")
        .trim();
      phaseDone(3, cleanReply.slice(0, 80));
      emit("done", { text: cleanReply });
      controller.close();
    } catch (err) {
      emit("error", {
        message: err instanceof Error ? err.message : "stream_failed",
      });
      controller.close();
    }
  },
});

return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  },
});
}
