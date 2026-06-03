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
      .order("updated_at", { ascending: false })
      .limit(120);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { tasks: rows ?? [] };
  });


/** Attach a stray task (project_id NULL) to a project; idempotent. */
export const attachTaskToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        projectId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("video_tasks")
      .update({ project_id: data.projectId, updated_at: new Date().toISOString() })
      .eq("id", data.taskId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * 老数据回填：把当前用户名下、`task_id IS NULL` 的 assets 按"同一天连续生成"分组，
 * 合成 video_tasks 行并把 asset 回挂到 task。仅在 enterProject 拉到 0 条远程 task 时触发。
 */
export const backfillLegacyTasksForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, name, kind, created_at, updated_at")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) return { created: 0, attachedAssets: 0 };

    const startMs = new Date(project.created_at).getTime() - 24 * 3600_000;
    const endMs = new Date(project.updated_at).getTime() + 7 * 24 * 3600_000;

    const { data: assets, error: aErr } = await supabase
      .from("assets")
      .select("id, url, kind, source, stage, label, caption, created_at, meta, parent_asset_id, version")
      .eq("user_id", userId)
      .is("task_id", null)
      .gte("created_at", new Date(startMs).toISOString())
      .lte("created_at", new Date(endMs).toISOString())
      .order("created_at", { ascending: true });
    if (aErr) throw new Error(aErr.message);
    if (!assets || assets.length === 0) return { created: 0, attachedAssets: 0 };

    type Row = (typeof assets)[number];
    const groups: Row[][] = [];
    for (const a of assets) {
      const ts = new Date(a.created_at).getTime();
      const last = groups[groups.length - 1];
      const lastTs = last ? new Date(last[last.length - 1].created_at).getTime() : 0;
      if (!last || ts - lastTs > 24 * 3600_000) groups.push([a]);
      else last.push(a);
    }

    const pickPrompt = (m: unknown): string => {
      const meta = (m ?? {}) as Record<string, unknown>;
      const cands = [meta.prompt, meta.scene_prompt, meta.user_prompt, meta.text];
      for (const c of cands) if (typeof c === "string" && c.trim()) return c.trim();
      return "";
    };
    const pickPoster = (m: unknown): string | undefined => {
      const meta = (m ?? {}) as Record<string, unknown>;
      const p = meta.poster ?? meta.thumbnail ?? meta.cover;
      return typeof p === "string" ? p : undefined;
    };

    let created = 0;
    let attached = 0;
    for (const g of groups) {
      const firstTs = new Date(g[0].created_at).getTime();
      const lastTs = new Date(g[g.length - 1].created_at).getTime();
      const snapshotAssets = g.map((a, i) => ({
        id: a.id,
        kind: a.kind,
        url: a.url,
        source: a.source ?? "seedance",
        stage: a.stage ?? "life",
        status: "Ready",
        version: a.version ?? 1,
        label: a.label ?? `S${String(i + 1).padStart(2, "0")}`,
        caption: a.caption ?? undefined,
        poster: pickPoster(a.meta),
        prompt: pickPrompt(a.meta) || undefined,
      }));

      let firstPrompt = "";
      for (const a of g) {
        const p = pickPrompt(a.meta);
        if (p) { firstPrompt = p; break; }
      }
      const briefPrompt = firstPrompt || project.name;

      const synthScript = {
        mood: "—",
        cameraLanguage: "—",
        structureSummary: [`从历史素材恢复 ${g.length} 个镜头`],
        wardrobe: [],
        shots: g.map((a, i) => ({
          shot: `A${String(i + 1).padStart(2, "0")}`,
          duration: "—",
          motion: "—",
          scene: ((a.meta as Record<string, unknown> | null)?.scene as string | undefined) ?? "—",
          elements: "—",
          prompt: pickPrompt(a.meta) || "—",
        })),
      };

      const createdDate = new Date(firstTs).toLocaleDateString("zh-CN");
      const stageSummaries: Record<string, string[]> = {
        life: [
          `已从历史素材恢复 ${g.length} 个镜头 · 项目「${project.name}」`,
          `项目类型：${project.kind} · 首次创建：${createdDate}`,
        ],
      };

      const snapshot = {
        kind: project.kind === "series" ? "series" : "oneoff",
        createdAt: firstTs,
        updatedAt: lastTs,
        status: "done",
        assets: snapshotAssets,
        stageSummaries,
        stageSnapshots: {},
        brief: {
          prompt: briefPrompt,
          adType: project.kind === "series" ? "Series" : "One-off",
          format: "—",
          visualSource: "—",
          mode: "Restored",
        },
        script: synthScript,
        failureReason: null,
        legacyBackfill: true,
        projectName: project.name,
        shotCount: g.length,
      };

      const { data: row, error: insErr } = await supabase
        .from("video_tasks")
        .insert({
          user_id: userId,
          project_id: project.id,
          title: project.name,
          prompt: briefPrompt,
          status: "completed",
          kind: project.kind === "series" ? "series" : "oneoff",
          snapshot: snapshot as unknown as never,
          created_at: new Date(firstTs).toISOString(),
          updated_at: new Date(lastTs).toISOString(),
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("[backfill] insert task failed", insErr);
        continue;
      }
      created += 1;

      const ids = g.map((a) => a.id);
      const { error: updErr } = await supabase
        .from("assets")
        .update({ task_id: row.id })
        .in("id", ids)
        .eq("user_id", userId)
        .is("task_id", null);
      if (updErr) console.error("[backfill] attach assets failed", updErr);
      else attached += ids.length;
    }

    return { created, attachedAssets: attached };
  });
