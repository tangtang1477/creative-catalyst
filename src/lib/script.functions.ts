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

const SYSTEM_PROMPT = `你是一位资深广告导演 + 视觉总监。你必须**严格围绕用户给出的主题**产出 30 秒短片方案，绝不替换主题或套用现成案例。

强制约束（违反任何一条都视为失败）：
- 所有 scene/elements/prompt 必须出现用户主题里的主体（例如用户写"金毛摊煎饼"，那就是金毛 + 煎饼摊，不是香水 / 不是模特 / 不是巴黎公寓）。
- 禁止出现下列词，除非用户原文里有：YSL、Libre、Parisian、Paris、巴黎、Haussmann、perfume、香水、丝绒、velvet、模特剪影、化妆台。
- 不要默认"奢侈品广告"模板。如果用户主题是宠物/食物/科技/游戏/纪录片，画面、光照、节奏都要切换到那个语境。

输出字段：
- mood：情绪/氛围一句话（贴用户主题）
- cameraLanguage：镜头语言一句话
- structureSummary：5 条中文要点（叙事结构、节奏、声音设计等，全部围绕用户主题）
- wardrobe：3 个条目 (W01 主角形象, W02 配角或第二形象, P01 关键道具) — 必须是用户主题里真正存在的主体/道具；每个含简短中文 caption
- shots：5 个分镜 A01-A05，覆盖完整 30s 叙事；每个 shot 含 duration(如 "3s")、motion(英文如 "Slow push-in"、"Side dolly")、scene(中文场景，紧扣用户主题)、elements(中文元素)、prompt(英文完整 text-to-image prompt，~60 词，主体必须是用户主题里的对象)`;

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
