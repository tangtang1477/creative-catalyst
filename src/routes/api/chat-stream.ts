import { createFileRoute } from "@tanstack/react-router";

/**
 * In-task chat 流式回复 (SSE)。
 *
 * 客户端 POST { messages: ChatMessage[], context?: {...} }，
 * 服务端把 Lovable AI Gateway 的 chat completion 流原样透传。
 *
 * 客户端解析 SSE 中 `data:` 行的 OpenAI 兼容 chunk
 * `choices[0].delta.content`，逐 token 拼接渲染。
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
        if (!messages.length) {
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

        const systemPrompt = [
          "你是 Vibe Aideo 的 AI 广告导演助手，负责和用户讨论当前正在制作的短片。",
          "回答用中文，简洁、专业、不寒暄，不超过 120 字。",
          "如果用户想改某镜头/重做/重渲染，明确说你会怎么做（如：'已记录，将重渲染 A03 并保持 A01-A02 一致性'）。",
          "如果还没有剧本/镜头，请如实说明，不要编造。",
          "禁止套用与用户主题无关的现成案例（例如 YSL/巴黎/丝绒等），紧扣用户实际输入。",
          ctxLines.length ? "—— 当前任务上下文 ——\n" + ctxLines.join("\n") : "",
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
          const text = await upstream.text();
          if (upstream.status === 429) {
            return new Response(
              JSON.stringify({ error: "rate_limited" }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (upstream.status === 402) {
            return new Response(
              JSON.stringify({ error: "payment_required" }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(text, { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
