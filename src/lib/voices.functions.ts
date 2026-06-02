import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not configured");
  return k;
}

export const listVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("voices")
      .select("id,user_id,source,external_id,name,lang,description,sample_url,status,error,created_at")
      .or(`source.eq.preset,user_id.eq.${userId}`)
      .order("source", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { voices: data ?? [] };
  });

export const previewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        voice_id: z.string().uuid(),
        text: z.string().trim().min(1).max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: voice, error: vErr } = await supabase
      .from("voices")
      .select("external_id,status")
      .eq("id", data.voice_id)
      .single();
    if (vErr || !voice) throw new Error(vErr?.message ?? "Voice not found");
    if (!voice.external_id) throw new Error("Voice has no external id yet");
    if (voice.status !== "ready") throw new Error("Voice not ready");

    const sample = data.text ?? "你好，这是这段音色的试听样本。Hello, this is a quick voice preview.";
    const apiKey = getApiKey();
    const res = await fetch(
      `${ELEVEN_BASE}/text-to-speech/${voice.external_id}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sample,
          model_id: "eleven_turbo_v2_5",
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Preview failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audioBase64: base64, mime: "audio/mpeg" };
  });

export const cloneVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().max(280).optional(),
        audio_url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Insert pending row
    const { data: row, error: insErr } = await supabase
      .from("voices")
      .insert({
        user_id: userId,
        source: "cloned",
        name: data.name,
        description: data.description ?? null,
        origin_audio_url: data.audio_url,
        status: "cloning",
        lang: "multi",
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Insert voice failed");

    try {
      const apiKey = getApiKey();
      // Fetch the audio bytes
      const audioRes = await fetch(data.audio_url);
      if (!audioRes.ok) throw new Error(`Fetch audio failed: ${audioRes.status}`);
      const audioBlob = await audioRes.blob();

      const form = new FormData();
      form.append("name", data.name);
      if (data.description) form.append("description", data.description);
      form.append("files", audioBlob, "sample.mp3");

      const cloneRes = await fetch(`${ELEVEN_BASE}/voices/add`, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (!cloneRes.ok) {
        const t = await cloneRes.text();
        throw new Error(`Clone failed: ${cloneRes.status} ${t.slice(0, 200)}`);
      }
      const cloneJson = (await cloneRes.json()) as { voice_id: string };

      const { data: updated, error: upErr } = await supabase
        .from("voices")
        .update({ external_id: cloneJson.voice_id, status: "ready" })
        .eq("id", row.id)
        .select("id,user_id,source,external_id,name,lang,description,sample_url,status,created_at")
        .single();
      if (upErr) throw new Error(upErr.message);
      return { voice: updated };
    } catch (e) {
      const msg = (e as Error).message;
      await supabase.from("voices").update({ status: "failed", error: msg }).eq("id", row.id);
      throw new Error(msg);
    }
  });

export const deleteVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("voices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
