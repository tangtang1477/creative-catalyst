import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GenerateScriptInput = z.object({
  prompt: z.string().min(1).max(4000),
  adType: z.string().optional().default(""),
  format: z.string().optional().default(""),
  visualSource: z.string().optional().default(""),
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "video", "audio"]),
        name: z.string().max(200).optional(),
        caption: z.string().max(400).optional(),
        url: z.string().url().optional(),
      }),
    )
    .max(20)
    .optional(),
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

const SYSTEM_PROMPT = `你是一位资深广告导演 + 视觉总监。严格围绕用户给出的主题产出短片方案，绝不替换主题或套用现成案例。

强制约束：
- 所有 scene/elements/prompt 必须围绕用户主题的真实主体（用户写"金毛摊煎饼"就是金毛 + 煎饼摊，不是香水 / 模特 / 巴黎）。
- 禁止默认"奢侈品广告"模板；按主题切换语境（宠物 / 食物 / 科技 / 游戏 / 纪录片 / MV …）。
- **数量按主题复杂度真实评估，不要硬凑也不要硬限**：
  - wardrobe：2–8 个条目（角色 W01/W02/W03… + 关键道具 P01/P02…），主题简单就 2–3 个，多角色或多道具时就多生成。
  - shots：3–12 个分镜（A01…A0N），简单概念片 3–5 个，叙事丰富时 6–12 个。
  - structureSummary：3–8 条要点，足够说清叙事即可。

输出字段：
- mood：情绪/氛围一句话
- cameraLanguage：镜头语言一句话
- structureSummary：3–8 条中文要点
- wardrobe：每条含 id（W01/W02/W03…/P01/P02… 自增）+ 简短中文 caption
- shots：每条含 shot(A01..A0N 自增)、duration(如 "3s")、motion(英文)、scene(中文)、elements(中文)、prompt(英文 ~60 词 text-to-image prompt)`;

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
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "W01/W02/W03... for characters, P01/P02... for props",
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
              shot: {
                type: "string",
                description: "A01, A02, ... sequential id",
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

    const attachmentLines = (data.attachments ?? []).map((a, i) => {
      const tag = a.kind === "image" ? "图片" : a.kind === "video" ? "视频" : "音频";
      return `${i + 1}. [${tag}] ${a.name ?? a.url ?? "asset"}${a.caption ? ` — ${a.caption}` : ""}${a.url ? ` (${a.url})` : ""}`;
    });
    const attachmentBlock = attachmentLines.length
      ? `\n\n用户已上传的素材（必须作为剧情主线元素 / 主角形象 / 关键场景参考，禁止生成与之无关的品牌、角色或场景）：\n${attachmentLines.join("\n")}`
      : "";

    const userMsg = [
      `用户需求：${data.prompt}`,
      data.adType ? `视频类型：${data.adType}` : "",
      data.format ? `规格：${data.format}` : "",
      data.visualSource ? `画面来源：${data.visualSource}` : "",
    ]
      .filter(Boolean)
      .join("\n") + attachmentBlock;

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
