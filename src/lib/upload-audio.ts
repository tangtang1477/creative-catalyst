import { supabase } from "@/integrations/supabase/client";

/**
 * 把 base64 音频上传到 media 桶 (路径: {user_id}/{taskId?}/{name})。
 * 返回公开 URL，可直接喂给 <audio src=...>。
 */
export async function uploadBase64Audio(opts: {
  base64: string;
  mime?: string;
  userId: string;
  taskId?: string;
  fileName?: string;
}): Promise<string> {
  const { base64, mime = "audio/mpeg", userId, taskId, fileName } = opts;
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });

  const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "mp3";
  const name = fileName ?? `${crypto.randomUUID()}.${ext}`;
  const path = taskId ? `${userId}/${taskId}/${name}` : `${userId}/${name}`;

  const { error } = await supabase.storage
    .from("media")
    .upload(path, blob, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}
