import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,kind,icon,brief,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { projects: data ?? [] };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        kind: z.enum(["series", "ad", "education", "mv", "custom"]).default("custom"),
        icon: z.string().max(40).optional(),
        brief: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: data.name,
        kind: data.kind,
        icon: data.icon ?? null,
        brief: data.brief ?? null,
      })
      .select("id,name,kind,icon,brief,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { project: row };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const attachEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        task_id: z.string().uuid(),
        episode_no: z.number().int().min(1).max(999).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("project_episodes")
      .insert({
        project_id: data.project_id,
        task_id: data.task_id,
        episode_no: data.episode_no,
        user_id: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { episode: row };
  });

export const getProjectEpisodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_episodes")
      .select("id,task_id,episode_no,created_at")
      .eq("project_id", data.project_id)
      .order("episode_no", { ascending: true });
    if (error) throw new Error(error.message);
    return { episodes: rows ?? [] };
  });
