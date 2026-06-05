import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { GeneratedScript } from "@/lib/script.functions";

/**
 * 服务端 PDF 文本抽取：用 unpdf（Worker 兼容、内嵌 WASM）。
 * 若抽到空字符串（扫描件 / 仅图像 PDF），回退用 Lovable AI Gateway 的
 * Gemini multimodal 把整份 PDF 当成图像 OCR。
 */
const PdfInput = z.object({
  base64: z.string().min(1).max(28_000_000), // ~20MB binary
});

export const extractPdfText = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PdfInput.parse(input))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));

    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bin);
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join("\n") : (res.text ?? "");
      text = text.trim();
    } catch (e) {
      console.warn("[extractPdfText] unpdf failed", e);
    }

    if (text.length > 20) {
      return { text: text.slice(0, 60_000) };
    }

    // 回退：multimodal OCR
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("PDF 未含可抽取文本，且 LOVABLE_API_KEY 未配置，无法 OCR");

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "system",
              content:
                "你是一名 OCR 助手。下面是一份剧本 PDF。请把全部正文文字按阅读顺序输出为纯文本，保留对白、场景描写与分段；不要二次创作。",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "请提取这份 PDF 的剧本文字。" },
                {
                  type: "image_url",
                  image_url: { url: `data:application/pdf;base64,${data.base64}` },
                },
              ],
            },
          ],
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OCR 回退失败 ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const ocr = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!ocr) throw new Error("PDF 内容为空，未能提取到文本");
    return { text: ocr.slice(0, 60_000) };
  });


const ParseInput = z.object({
  text: z.string().min(1).max(60000),
  briefHint: z.string().max(2000).optional(),
});

const SYSTEM_PROMPT = `你是一位资深短片导演 / 剧本拆解师。用户已经写好了一份剧本（可能是中文小说体 / 剧本格式 / 分镜文字稿 / 脚本大纲），你的任务是**忠实地抽取**它的结构，**不要二次创作**：
- 严格沿用用户剧本里的人物、场景、情节、台词意图，禁止替换主角 / 套用其它案例。
- shots 数量按原剧本真实分镜数（3–12 个，如果剧本超过 12 个分镜就合并相邻镜头）。
- wardrobe（人物 + 关键道具）按剧本真实出场角色 / 道具数量（2–8 条，超过就只保留最重要的）。
- mood / cameraLanguage 用一两句中文概括原剧本的整体调性。
- structureSummary 用 3–8 条中文要点概括剧情骨架。
- 每个 shot 的 prompt 用英文 text-to-image prompt（~60 词），紧扣该镜头的真实画面，禁止套用品牌广告模板。`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_script",
    description: "Emit the parsed short-film plan as structured JSON.",
    parameters: {
      type: "object",
      properties: {
        mood: { type: "string" },
        cameraLanguage: { type: "string" },
        structureSummary: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 8,
        },
        wardrobe: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "W01/W02… for characters, P01/P02… for props",
              },
              caption: { type: "string" },
            },
            required: ["id", "caption"],
            additionalProperties: false,
          },
        },
        shots: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              shot: { type: "string", description: "A01, A02, … sequential id" },
              duration: { type: "string" },
              motion: { type: "string" },
              scene: { type: "string" },
              elements: { type: "string" },
              prompt: { type: "string" },
            },
            required: ["shot", "duration", "motion", "scene", "elements", "prompt"],
            additionalProperties: false,
          },
        },
      },
      required: ["mood", "cameraLanguage", "structureSummary", "wardrobe", "shots"],
      additionalProperties: false,
    },
  },
};

/**
 * 把用户上传的剧本纯文本解析成 GeneratedScript 结构。
 * 与 generateScript 共用 tool schema，前端可直接灌进 store.script。
 */
export const parseScriptText = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ParseInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedScript> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const userMsg =
      (data.briefHint ? `用户额外要求：${data.briefHint}\n\n` : "") +
      `—— 用户剧本（原文）——\n${data.text}`;

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
          tools: [TOOL],
          tool_choice: {
            type: "function",
            function: { name: "emit_script" },
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const argsStr =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI returned no tool_call arguments");
    return JSON.parse(argsStr) as GeneratedScript;
  });
