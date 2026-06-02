import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCharacterVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        task_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("character_voices")
      .select("id,character_name,voice_id,task_id,project_id,created_at");
    if (data.task_id) q = q.eq("task_id", data.task_id);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { bindings: rows ?? [] };
  });

export const bindCharacterVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        character_name: z.string().trim().min(1).max(80),
        voice_id: z.string().uuid(),
        task_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("character_voices")
      .insert({
        user_id: userId,
        character_name: data.character_name,
        voice_id: data.voice_id,
        task_id: data.task_id ?? null,
        project_id: data.project_id ?? null,
      })
      .select("id,character_name,voice_id,task_id,project_id,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { binding: row };
  });

export const unbindCharacterVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("character_voices")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
