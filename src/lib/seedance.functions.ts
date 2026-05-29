import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Seedance 服务地址（默认线上，可通过 SEEDANCE_HOST 覆盖） */
const SEEDANCE_HOST = process.env.SEEDANCE_HOST ?? "https://vb.movieflow.ai";

/** 支持的路由 */
const ROUTES = [
  "text-to-video",
  "first-frame-to-video",
  "first-last-frame-to-video",
  "reference-image-to-video",
  "reference-video",
  "extend-video",
  "create-task",
] as const;

const SubmitInput = z.object({
  route: z.enum(ROUTES),
  videoTaskId: z.string().uuid().optional(),
  /** 透传给 Seedance 的请求体；不同路由形状不一样，最外层只校验关键字段 */
  payload: z
    .object({
      prompt: z.string().min(1).max(4000),
      model: z
        .enum(["sd2.0", "sd2.0-1080p", "sd2.0-fast", "sd2.0-fast-1080p"])
        .optional(),
      ratio: z.string().optional(),
      resolution: z.enum(["480p", "720p", "1080p"]).optional(),
      duration: z.number().int().optional(),
      generate_audio: z.boolean().optional(),
    })
    .passthrough(),
});

function buildAuthHeaders(): Record<string, string> {
  const key = process.env.SEEDANCE_API_KEY;
  if (!key) return {};
  // 文档未明确鉴权方式；先按最常见的 Bearer 方案，
  // 若上游不接受可在此切换。
  return { Authorization: `Bearer ${key}` };
}

interface SeedanceEnvelope<T = unknown> {
  code: number;
  message?: string;
  successful?: boolean;
  data?: T;
}

async function callSeedance<T = unknown>(
  path: string,
  body: unknown,
): Promise<SeedanceEnvelope<T>> {
  const res = await fetch(`${SEEDANCE_HOST}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: SeedanceEnvelope<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Seedance ${path} returned non-JSON [${res.status}]: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Seedance ${path} HTTP ${res.status}: ${json.message ?? text.slice(0, 200)}`);
  }
  return json;
}

/**
 * 提交视频生成任务。
 * 默认模型注入 sd2.0-fast（除非 payload 显式指定）。
 * 拿到 task_id 后写入 seedance_jobs 表。
 */
export const submitVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SubmitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const payload = {
      model: "sd2.0-fast" as const,
      ...data.payload,
    };

    const envelope = await callSeedance<{ task_id?: string; error?: string }>(
      `/seedance2/${data.route}`,
      payload,
    );

    if (envelope.code !== 0 || !envelope.data?.task_id) {
      throw new Error(
        envelope.message ||
          envelope.data?.error ||
          "Seedance returned no task_id",
      );
    }

    const taskId = envelope.data.task_id;

    const { error } = await supabaseAdmin.from("seedance_jobs").insert({
      task_id: taskId,
      user_id: userId,
      video_task_id: data.videoTaskId ?? null,
      route: data.route,
      status: "pending",
      request_payload: payload,
    });
    if (error) {
      console.error("[seedance] failed to insert job", error);
    }

    return { taskId };
  });

const PollInput = z.object({
  taskId: z.string().min(1).max(120),
  aspectRatio: z
    .enum([
      "VIDEO_ASPECT_RATIO_LANDSCAPE",
      "VIDEO_ASPECT_RATIO_PORTRAIT",
      "VIDEO_ASPECT_RATIO_SQUARE",
    ])
    .optional(),
});

interface StatusData {
  task_id?: string;
  status?: string;
  progress?: number;
  video_url?: string;
  oss_url?: string;
  raw?: unknown;
}

/**
 * 查询视频任务状态。
 * 拿到 oss_url 后自动写入 assets 表 + 更新 seedance_jobs/video_tasks。
 */
export const pollVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PollInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 校验任务归属
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("seedance_jobs")
      .select("task_id, user_id, video_task_id, asset_id, status, oss_url")
      .eq("task_id", data.taskId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job || job.user_id !== userId) {
      throw new Error("Task not found");
    }

    // 已完成直接返回
    if (job.status === "success" && job.oss_url) {
      return {
        status: "success" as const,
        progress: 100,
        ossUrl: job.oss_url,
        assetId: job.asset_id,
      };
    }

    const envelope = await callSeedance<StatusData>("/seedance2/task-status", {
      task_id: data.taskId,
      aspect_ratio: data.aspectRatio ?? "VIDEO_ASPECT_RATIO_LANDSCAPE",
    });

    const status = envelope.data?.status ?? "processing";
    const progress = envelope.data?.progress ?? 0;
    const ossUrl = envelope.data?.oss_url ?? null;
    const videoUrl = envelope.data?.video_url ?? null;

    const normalized =
      status === "success" || status === "succeeded"
        ? "success"
        : status === "failed" || status === "failure"
          ? "failed"
          : "processing";

    let assetId: string | null = job.asset_id ?? null;

    if (normalized === "success" && ossUrl) {
      // 原子声明：只有当 oss_url 仍为空的那行才能更新成功，并返回。
      // 并发的 tick 拿不到行，就跳过 insert，避免重复写 asset。
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from("seedance_jobs")
        .update({
          status: "success",
          progress: 100,
          oss_url: ossUrl,
          raw: (envelope.data ?? null) as unknown as never,
        })
        .eq("task_id", data.taskId)
        .is("oss_url", null)
        .select("task_id")
        .maybeSingle();
      if (claimErr) console.error("[seedance] claim failed", claimErr);

      if (claimed) {
        const { data: asset, error: assetErr } = await supabaseAdmin
          .from("assets")
          .insert({
            user_id: userId,
            task_id: job.video_task_id ?? null,
            kind: "video",
            url: ossUrl,
            source: "seedance",
            stage: "life",
            meta: { seedance_task_id: data.taskId },
          })
          .select("id")
          .single();
        if (assetErr) {
          console.error("[seedance] insert asset failed", assetErr);
        } else {
          assetId = asset.id;
          await supabaseAdmin
            .from("seedance_jobs")
            .update({ asset_id: assetId })
            .eq("task_id", data.taskId);
        }
      } else {
        // 别人已经声明并写了 asset，复读一次拿到 asset_id
        const { data: refreshed } = await supabaseAdmin
          .from("seedance_jobs")
          .select("asset_id, oss_url")
          .eq("task_id", data.taskId)
          .maybeSingle();
        assetId = refreshed?.asset_id ?? assetId;
      }
    } else {
      await supabaseAdmin
        .from("seedance_jobs")
        .update({
          status: normalized,
          progress,
          raw: (envelope.data ?? null) as unknown as never,
        })
        .eq("task_id", data.taskId);
    }

    if (job.video_task_id && normalized !== "processing") {
      await supabaseAdmin
        .from("video_tasks")
        .update({ status: normalized })
        .eq("id", job.video_task_id);
    }

    return {
      status: normalized,
      progress,
      ossUrl,
      videoUrl,
      assetId,
    };
  });
