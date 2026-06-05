import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatReplyInput = z.object({
  messages: z.array(Msg).min(1).max(20),
  context: z
    .object({
      phase: z.string().optional(),
      brief: z
        .object({
          prompt: z.string().optional(),
          adType: z.string().optional(),
          format: z.string().optional(),
          visualSource: z.string().optional(),
        })
        .optional(),
      script: z
        .object({
          mood: z.string().optional(),
          shots: z
            .array(
              z.object({
                shot: z.string(),
                duration: z.string(),
                scene: z.string(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const chatReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatReplyInput.parse(input))
  .handler(async ({ data }): Promise<{ reply: string; error?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { reply: "AI 暂不可用（缺少配置）", error: "missing_key" };
    }

    const ctx = data.context;
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
      "回答用中文，简洁、专业、不寒暄，不超过 80 字。",
      "如果用户想改某镜头/重做/重渲染，明确说你会怎么做（如：'已记录，将重渲染 A03 并保持 A01-A02 一致性'）。",
      "如果还没有剧本/镜头，请如实说明，不要编造。",
      "禁止套用任何与用户主题无关的现成案例（例如 YSL/巴黎/丝绒等），紧扣用户实际输入。",
      ctxLines.length ? "—— 当前任务上下文 ——\n" + ctxLines.join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              ...data.messages,
            ],
          }),
        },
      );

      if (res.status === 429) {
        return { reply: "请求过于频繁，请稍后再试。", error: "rate_limited" };
      }
      if (res.status === 402) {
        return {
          reply: "AI 额度已用尽，请到 Settings · Usage 充值后再试。",
          error: "payment_required",
        };
      }
      if (!res.ok) {
        const t = await res.text();
        console.error("chatReply gateway error", res.status, t.slice(0, 300));
        return { reply: "AI 暂不可用，请稍后再试。", error: `http_${res.status}` };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = json.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        return { reply: "AI 没有返回内容，请换种说法再试一次。", error: "empty" };
      }
      return { reply };
    } catch (e) {
      console.error("chatReply error", e);
      return {
        reply: "网络异常，AI 暂时无法响应。",
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  });
