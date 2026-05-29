import { createFileRoute } from "@tanstack/react-router";

/**
 * 流式图片生成 (gpt-image-2).
 * 客户端 POST { prompt, size?, quality? }；
 * 服务端把 Lovable AI Gateway 的 SSE 流原样透传。
 *
 * 客户端需自行解析 SSE，逐帧渲染 partial base64 图。
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        let body: {
          prompt?: string;
          size?: string;
          quality?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const prompt = (body.prompt ?? "").trim();
        if (!prompt) {
          return new Response("prompt is required", { status: 400 });
        }

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-image-2",
              prompt,
              size: body.size ?? "1024x1024",
              quality: body.quality ?? "low",
              stream: true,
              partial_images: 2,
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          if (upstream.status === 429) {
            return new Response(
              JSON.stringify({
                error: "Rate limited, please try again later.",
              }),
              {
                status: 429,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          if (upstream.status === 402) {
            return new Response(
              JSON.stringify({
                error:
                  "AI credits exhausted. Please top up in workspace usage settings.",
              }),
              {
                status: 402,
                headers: { "Content-Type": "application/json" },
              },
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
