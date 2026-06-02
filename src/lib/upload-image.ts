import { supabase } from "@/integrations/supabase/client";

/**
 * 把 base64 PNG 上传到 media 桶 (路径: {user_id}/{taskId?}/{name}.png)。
 * 返回公开 URL，可直接传给 Seedance 的 image_url 字段。
 */
export async function uploadBase64Image(opts: {
  base64: string;
  userId: string;
  taskId?: string;
  fileName?: string;
}): Promise<string> {
  const { base64, userId, taskId, fileName } = opts;
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });

  const name = fileName ?? `${crypto.randomUUID()}.png`;
  const path = taskId ? `${userId}/${taskId}/${name}` : `${userId}/${name}`;

  const { error } = await supabase.storage
    .from("media")
    .upload(path, blob, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 通用文件上传到 media 桶。返回公开 URL。
 * 用于用户上传图片 / 视频 / 音频。音频后续可被 cloneVoice 引用。
 */
export async function uploadGenericFile(opts: {
  file: File;
  userId: string;
  taskId?: string;
}): Promise<string> {
  const { file, userId, taskId } = opts;
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safe = `${crypto.randomUUID()}${ext}`;
  const path = taskId ? `${userId}/${taskId}/${safe}` : `${userId}/${safe}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 解析 SSE 流，拿到最终（completed）base64 图片；
 * onPartial 用于逐帧渲染预览（带 blur）。
 */
export async function streamGenerateImage(opts: {
  prompt: string;
  size?: string;
  quality?: "low" | "medium" | "high";
  onPartial?: (dataUrl: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      size: opts.size,
      quality: opts.quality,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`generate-image failed [${res.status}]: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalB64: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        // OpenAI 图像 SSE 事件形式：data: { type: 'image_generation.partial_image'|'completed', b64_json: '...' }
        const type: string | undefined =
          parsed.type ?? parsed.event ?? parsed.choices?.[0]?.delta?.type;
        const b64: string | undefined =
          parsed.b64_json ??
          parsed.data?.b64_json ??
          parsed.image?.b64_json ??
          parsed.choices?.[0]?.delta?.b64_json;
        if (!b64) continue;
        const dataUrl = `data:image/png;base64,${b64}`;
        if (type && /completed|final|done/i.test(type)) {
          finalB64 = b64;
        } else {
          opts.onPartial?.(dataUrl);
        }
      } catch {
        // partial JSON, put back
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  if (!finalB64) throw new Error("No completed image received");
  return finalB64;
}
