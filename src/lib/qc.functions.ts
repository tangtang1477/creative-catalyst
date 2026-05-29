import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ShotInput = z.object({
  id: z.string().min(1).max(20),
  url: z.string().url().max(2000),
  scene: z.string().max(500).optional().default(""),
  elements: z.string().max(500).optional().default(""),
});

const QcInput = z.object({
  shots: z.array(ShotInput).min(1).max(8),
  brief: z
    .object({
      prompt: z.string().max(2000).optional(),
      adType: z.string().optional(),
    })
    .optional(),
});

export type QcDimension =
  | "角色一致性"
  | "场景一致性"
  | "服装/道具连贯"
  | "故事连贯性"
  | "幻觉/事实性"
  | "法务/合规";

const ALL_DIMENSIONS: QcDimension[] = [
  "角色一致性",
  "场景一致性",
  "服装/道具连贯",
  "故事连贯性",
  "幻觉/事实性",
  "法务/合规",
];

export interface QcIssue {
  shotId: string;
  dimension: QcDimension;
  severity: "low" | "medium" | "high";
  suggestion: string;
  fixPrompt: string;
}

export interface QcResult {
  issues: QcIssue[];
  passedDimensions: QcDimension[];
  degraded?: boolean;
  error?: string;
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "report_qc",
    description: "Report consistency issues across keyframes.",
    parameters: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              shotId: { type: "string" },
              dimension: {
                type: "string",
                enum: ALL_DIMENSIONS,
              },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              suggestion: { type: "string" },
              fixPrompt: {
                type: "string",
                description:
                  "English text-to-image prompt to regenerate this shot with the fix applied. ~60 words.",
              },
            },
            required: [
              "shotId",
              "dimension",
              "severity",
              "suggestion",
              "fixPrompt",
            ],
            additionalProperties: false,
          },
        },
        passedDimensions: {
          type: "array",
          items: { type: "string", enum: ALL_DIMENSIONS },
        },
      },
      required: ["issues", "passedDimensions"],
      additionalProperties: false,
    },
  },
};

export const checkConsistency = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => QcInput.parse(input))
  .handler(async ({ data }): Promise<QcResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        issues: [],
        passedDimensions: ALL_DIMENSIONS,
        degraded: true,
        error: "missing_key",
      };
    }

    const sys = [
      "你是一位严苛的视觉一致性审查官，负责检查同一支短片不同镜头之间是否一致。",
      "你将看到 N 张关键帧图。请检查 6 个维度：角色一致性、场景一致性、服装/道具连贯、故事连贯性、幻觉/事实性、法务/合规。",
      "只报告真实存在的问题，最多 3 条。如果全部通过，issues 返回空数组，passedDimensions 返回全部 6 项。",
      "每个 issue 必须给出 shotId（与输入一致）、维度、严重度、中文 suggestion、英文 fixPrompt（用于重新生成该镜头）。",
      "fixPrompt 必须紧扣用户主题，禁止编造与用户输入无关的品牌/地点（例如 YSL/巴黎/香水），除非用户主题本身就是。",
    ].join("\n");

    const userText = [
      data.brief?.prompt ? `用户主题：${data.brief.prompt}` : "",
      data.brief?.adType ? `视频类型：${data.brief.adType}` : "",
      "以下是各镜头的图与描述：",
      ...data.shots.map(
        (s) => `[${s.id}] scene=${s.scene}; elements=${s.elements}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const userContent: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: userText }];
    for (const s of data.shots) {
      userContent.push({ type: "image_url", image_url: { url: s.url } });
    }

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
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userContent },
            ],
            tools: [TOOL],
            tool_choice: {
              type: "function",
              function: { name: "report_qc" },
            },
          }),
        },
      );

      if (!res.ok) {
        const t = await res.text();
        console.error("checkConsistency gateway error", res.status, t.slice(0, 300));
        return {
          issues: [],
          passedDimensions: ALL_DIMENSIONS,
          degraded: true,
          error: `http_${res.status}`,
        };
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{
              function?: { arguments?: string };
            }>;
          };
        }>;
      };
      const argsStr =
        json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) {
        return {
          issues: [],
          passedDimensions: ALL_DIMENSIONS,
          degraded: true,
          error: "no_tool_call",
        };
      }
      const parsed = JSON.parse(argsStr) as {
        issues: QcIssue[];
        passedDimensions: QcDimension[];
      };
      // Make sure passedDimensions are unique and only valid
      const passed = Array.from(
        new Set(parsed.passedDimensions.filter((d) => ALL_DIMENSIONS.includes(d))),
      );
      return { issues: parsed.issues ?? [], passedDimensions: passed };
    } catch (e) {
      console.error("checkConsistency error", e);
      return {
        issues: [],
        passedDimensions: ALL_DIMENSIONS,
        degraded: true,
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  });
