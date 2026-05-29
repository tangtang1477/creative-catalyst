import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GenerateScriptInput = z.object({
  prompt: z.string().min(1).max(4000),
  adType: z.string().optional().default(""),
  format: z.string().optional().default(""),
  visualSource: z.string().optional().default(""),
});

export interface ScriptShot {
  shot: string;
  duration: string;
  motion: string;
  scene: string;
  elements: string;
  prompt: string;
}

export interface ScriptWardrobe {
  id: string;
  caption: string;
}

export interface GeneratedScript {
  mood: string;
  cameraLanguage: string;
  structureSummary: string[];
  wardrobe: ScriptWardrobe[];
  shots: ScriptShot[];
}

const SYSTEM_PROMPT = `你是一位资深广告导演 + 视觉总监。根据用户的一句话需求，产出 30 秒短片的完整方案：
- mood：情绪/氛围一句话
- cameraLanguage：镜头语言一句话
- structureSummary：5 条中文要点（叙事结构、节奏、声音设计等）
- wardrobe：3 个条目 (W01 主角服装/形象, W02 配角或第二形象, P01 关键道具)，每个含简短中文 caption
- shots：5 个分镜 A01-A05，覆盖完整 30s 叙事；每个 shot 含 duration(如 "3s")、motion(英文如 "Slow push-in"、"Side dolly")、scene(中文场景)、elements(中文元素)、prompt(英文完整 text-to-image prompt，包含主体/构图/光照/镜头/风格，~60 词)
所有文案紧扣用户主题，绝不照搬其他案例（不要 YSL/巴黎/丝绒，除非用户明确要求）。`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_script",
    description: "Emit the full short-film plan as structured JSON.",
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
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: ["W01", "W02", "P01"] },
              caption: { type: "string" },
            },
            required: ["id", "caption"],
            additionalProperties: false,
          },
        },
        shots: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              shot: {
                type: "string",
                enum: ["A01", "A02", "A03", "A04", "A05"],
              },
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

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateScriptInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedScript> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const userMsg = [
      `用户需求：${data.prompt}`,
      data.adType ? `视频类型：${data.adType}` : "",
      data.format ? `规格：${data.format}` : "",
      data.visualSource ? `画面来源：${data.visualSource}` : "",
    ]
      .filter(Boolean)
      .join("\n");

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
    if (!argsStr) {
      throw new Error("AI returned no tool_call arguments");
    }
    const parsed = JSON.parse(argsStr) as GeneratedScript;
    return parsed;
  });
