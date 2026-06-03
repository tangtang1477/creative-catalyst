import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EditInput = z.object({
  prompt: z.string().min(1).max(4000),
  imageUrls: z.array(z.string().url().max(2000)).min(1).max(6),
});

async function callGeminiImageEdit(
  prompt: string,
  imageUrls: string[],
): Promise<{ b64: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: prompt }];
  for (const url of imageUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const res = await fetch(
    "https://ai.gateway.lovable.dev/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`image-edit gateway ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Gemini image edit returned no b64_json");
  return { b64 };
}

/**
 * Multimodal image edit via Gemini Nano Banana.
 * Accepts up to 6 reference image URLs + an instruction prompt.
 */
export const editImageWithRefs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EditInput.parse(input))
  .handler(async ({ data }): Promise<{ b64: string }> => {
    return callGeminiImageEdit(data.prompt, data.imageUrls);
  });

/**
 * 图层编辑：在 prompt 前面拼一段 "只改这些图层、其它不动" 的约束。
 * Lovart 同款"分层编辑"的最小实现。
 */
const LayerEditInput = z.object({
  prompt: z.string().min(1).max(4000),
  imageUrls: z.array(z.string().url().max(2000)).min(1).max(6),
  layers: z.array(z.string().min(1).max(40)).max(8).optional(),
});

export const editAssetWithLayers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LayerEditInput.parse(input))
  .handler(async ({ data }): Promise<{ b64: string }> => {
    const layerLine = data.layers && data.layers.length
      ? `Edit ONLY these layers/aspects: ${data.layers.join(", ")}. Keep every other layer (composition, identity, color palette outside these aspects) strictly unchanged.\n\n`
      : "";
    const full = `${layerLine}User instruction: ${data.prompt}\n\nThe FIRST reference image is the original to be edited; subsequent images (if any) are style/identity references only — do not copy their composition.`;
    return callGeminiImageEdit(full, data.imageUrls);
  });

