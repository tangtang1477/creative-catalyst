import { createFileRoute } from "@tanstack/react-router";

/**
 * In-task chat 分阶段 SSE 流。
 *
 * 客户端 POST { messages, context? }，server 端先 emit 4 个预设 phase，再调用
 * Lovable AI Gateway（stream=true），解析 `<thinking>...</thinking>` 块并把
 * 子段映射成 thinking / phase-start / phase-done 事件，剩余正文按 token 事件
 * 逐块推送给前端，实现真正的逐字流 + 多步思考展示。
 *
 * SSE 事件格式：
 *   event: phase | phase-start | thinking | phase-done | token | done | error
 *   data:  <json>
 */
export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        if (ctx?.brief?.prompt) ctxLines.push(`用户需求：${ctx.brief.prompt}`);
        if (ctx?.brief?.adType) ctxLines.push(`视频类型：${ctx.brief.adType}`);
        if (ctx?.brief?.format) ctxLines.push(`规格：${ctx.brief.format}`);
        if (ctx?.script?.mood) ctxLines.push(`情绪：${ctx.script.mood}`);
        if (ctx?.script?.shots?.length) {
          ctxLines.push(
            "已生成镜头：" +
              ctx.script.shots
                .map((s) => `${s.shot}(${s.duration}) ${s.scene}`)
                .join("； "),
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
            '{"intro":"…一句话开场，呼应用户的需求…","questions":[',
            '  {"id":"duration","label":"…","options":[{"id":"opt1","label":"…"},…],"allowOther":true},',
            '  {"id":"tone","label":"…","options":[…],"allowOther":true},',
            '  {"id":"style","label":"…","options":[…],"allowOther":true}',
            '],"outro":"…一句话告诉用户点 Continue 即可开始制作…"}',
            "要求：",
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
          const intro = typeof parsed.intro === "string" ? parsed.intro : "好的，先确认几个关键方向：";
          const outro = typeof parsed.outro === "string" ? parsed.outro : "选完点 Continue，我就开始制作。";
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
              // 流式吐 intro
              for (const ch of intro) {
                emit("token", { text: ch });
                await new Promise((r) => setTimeout(r, 12));
              }
              emit("token", { text: "\n\n" });
              emit("option-card", {
                id: `oc_${Date.now().toString(36)}`,
                questions,
                intent: "preflight",
              });
              emit("token", { text: "\n" });
              for (const ch of outro) {
                emit("token", { text: ch });
                await new Promise((r) => setTimeout(r, 12));
              }
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
          "你是 Vibe Aideo 的 AI 广告导演助手。请按以下严格格式输出，不要省略任何标签：",
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
          "**指令协议（重要）**：如果用户的话**明确要求改动**当前 brief / 脚本 / 角色 / 场景（例如\"把女主换成男主\"\"场景改成雨夜地铁\"\"时长改成 30 秒\"），在回复正文之后追加一个 `<directives>...</directives>` JSON 块（不要 markdown 代码块），schema：",
          '{"patch":{"brief":{"prompt"?:string,"adType"?:string,"format"?:string},"script":{"mood"?:string,"shots"?:[{"shot":string,"duration"?:string,"scene"?:string,"motion"?:string,"elements"?:string,"prompt"?:string}]},"characters":[{"id":string,"name"?:string,"look"?:string}],"scenes":[{"id":string,"name"?:string,"description"?:string}]},"rerun":["script"|"wardrobe"|"cast"|"paint"]}',
          "- 只输出**真正需要改动**的字段，无须改动就**完全不要**输出 <directives> 标签。",
          "- rerun 数组列出受影响、需要重跑的阶段。",
          "- JSON 之外不要任何额外字符。",
          "",
          "规则：每个 ## 小节只写 1-2 行；最终回复必须紧扣用户输入，禁止套用 YSL/巴黎/丝绒 等无关案例。",
          ctxLines.length ? "\n—— 当前任务上下文 ——\n" + ctxLines.join("\n") : "",
        ]
          .filter(Boolean)
          .join("\n");

        const upstream = await fetch(
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
            signal: request.signal,
          },
        );

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
              if (openIdx >= 0) {
                const visible = combined.slice(0, openIdx);
                if (visible) emit("token", { text: visible });
                replyTail = "";
                replyAcc += combined; // 保留全量含 tag，后处理解析
                directivesOpen = true;
                return;
              }
              // 保留最后 12 个字符在 tail，避免 "<direct" 跨 chunk 漏判
              const SAFE = 12;
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
                for (let i = currentPhaseIdx; i < 3; i++) phaseDone(i, "（跳过）");
                currentPhaseIdx = 3;
                phaseStart(3);
                if (!replyAcc) {
                  replyAcc = fullText.trim() || "（AI 没有返回正文）";
                  emit("token", { text: replyAcc });
                }
              }

              phaseDone(3, replyAcc.slice(0, 80));
              emit("done", { text: replyAcc });
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
      },
    },
  },
});
