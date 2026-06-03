import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 跨设备任务快照：把 store 里的 taskHistory 单条记录持久化到 video_tasks.snapshot
 * 里。前端按 (user_id, project_id) 拉回。
 */

const SnapshotInput = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  status: z.enum(["running", "ready", "failed", "completed"]).optional(),
  prompt: z.string().max(8000).optional(),
  // snapshot 是结构化 JSON，宽松校验：只限大小，内容由前端定义。
  snapshot: z
    .record(z.unknown())
    .refine((v) => JSON.stringify(v).length < 500_000, "snapshot too large"),
});

/** Upsert (insert or update) a task snapshot keyed by id. */
export const upsertTaskSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SnapshotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      id: data.taskId,
      user_id: userId,
      project_id: data.projectId ?? null,
      title: data.title,
      prompt: data.prompt ?? "",
      status: data.status ?? "running",
      kind: "oneoff" as const,
      snapshot: data.snapshot as unknown as never,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("video_tasks").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

/** List task snapshots for a project (or all of user's snapshots). */
export const listProjectTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("video_tasks")
      .select("id, title, prompt, status, project_id, snapshot, created_at, updated_at")
      .eq("user_id", userId)
      .not("snapshot", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { tasks: rows ?? [] };
  });
