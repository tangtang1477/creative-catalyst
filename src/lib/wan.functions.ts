import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** WAN(vb.movieflow.ai) base host. */
const WAN_HOST = process.env.WAN_HOST ?? "http://vb.movieflow.ai";

const ROUTES = [
  "text-to-video",
  "first-frame-to-video",
  "reference-image-to-video",
] as const;
type Route = (typeof ROUTES)[number];

const ROUTE_PATH: Record<Route, string> = {
  "text-to-video": "/video-base/generate-video",
  "first-frame-to-video": "/video-base/generate-video-by-image",
  "reference-image-to-video":
    "/video-base/generate-video-by-image-use-reference-images",
};

const ROUTE_DBKEY: Record<Route, string> = {
  "text-to-video": "t2v",
  "first-frame-to-video": "i2v",
  "reference-image-to-video": "r2v",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SubmitInput = z.object({
  route: z.enum(ROUTES),
  videoTaskId: z.preprocess((v) => {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return null;
    return UUID_RE.test(t) ? t : null;
  }, z.string().uuid().nullable().optional()),
  payload: z
    .object({
      prompt: z.string().min(1).max(4000),
      // 仅在 first-frame-to-video 使用
      image_url: z.string().url().optional(),
      // 仅在 reference-image-to-video 使用
      image_urls: z.array(z.string().url()).max(3).optional(),
      // 旧的 16:9 / 9:16 字符串
      ratio: z.string().optional(),
      // 也允许直接传 WAN 枚举
      aspect_ratio: z
        .enum([
          "VIDEO_ASPECT_RATIO_LANDSCAPE",
          "VIDEO_ASPECT_RATIO_PORTRAIT",
          "VIDEO_ASPECT_RATIO_SQUARE",
        ])
        .optional(),
      video_name: z.string().min(1).max(120).optional(),
      project_id: z.string().min(1).max(120).optional(),
    })
    .passthrough(),
});

function ratioToAspect(
  ratio: string | undefined,
  explicit: string | undefined,
): "VIDEO_ASPECT_RATIO_LANDSCAPE" | "VIDEO_ASPECT_RATIO_PORTRAIT" {
  if (
    explicit === "VIDEO_ASPECT_RATIO_LANDSCAPE" ||
    explicit === "VIDEO_ASPECT_RATIO_PORTRAIT"
  ) {
    return explicit;
  }
  if (!ratio) return "VIDEO_ASPECT_RATIO_LANDSCAPE";
  const m = ratio.match(/(\d+)\s*:\s*(\d+)/);
  if (!m) return "VIDEO_ASPECT_RATIO_LANDSCAPE";
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0)
    return "VIDEO_ASPECT_RATIO_LANDSCAPE";
  return w >= h ? "VIDEO_ASPECT_RATIO_LANDSCAPE" : "VIDEO_ASPECT_RATIO_PORTRAIT";
}

interface WanOperation {
  operation: { name: string };
  sceneId?: string;
  status?: string;
  supplier?: string;
  origin?: string;
  gen_type?: string;
  qiniuVideoUrl?: string;
}

interface WanCreateResp {
  operations?: WanOperation[];
  error?: string;
}

interface WanCheckResp {
  finished?: boolean;
  all_error?: boolean;
  error_message?: string;
  result?: { operations?: WanOperation[] };
}

/** 把上游错误归类为前端可识别的 code + 中文文案。 */
export function classifyWanError(raw: string | undefined | null): {
  code:
    | "policy_real_person"
    | "policy_violation"
    | "quota_exceeded"
    | "submit_failed";
  message: string;
  upstream: string;
} {
  const upstream = (raw ?? "").toString();
  const lower = upstream.toLowerCase();
  if (
    /inputimagesensitivecontentdetected|realperson|privacyinformation|real person/i.test(
      upstream,
    )
  ) {
    return {
      code: "policy_real_person",
      message: "参考图疑似包含真实人物，已自动降级重试",
      upstream,
    };
  }
  if (
    /policyviolation|sensitivecontent|sensitive_content|content_policy|risk/i.test(
      lower,
    )
  ) {
    return {
      code: "policy_violation",
      message: "提示词或参考图触发上游安全审核，请调整后重试",
      upstream,
    };
  }
  if (/quota|rate.?limit|limitexceeded|too many/i.test(lower)) {
    return {
      code: "quota_exceeded",
      message: "上游配额已用尽或被限流，请稍后再试",
      upstream,
    };
  }
  return {
    code: "submit_failed",
    message: "视频生成失败，请稍后重试",
    upstream,
  };
}

async function callWan<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WAN_HOST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `WAN ${path} returned non-JSON [${res.status}]: ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`WAN ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

/** 提交 WAN 视频生成任务，返回 operations 数组（轮询需原样回传）。 */
export const submitVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SubmitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const aspect = ratioToAspect(
      data.payload.ratio,
      data.payload.aspect_ratio,
    );
    const projectId =
      data.payload.project_id ?? data.videoTaskId ?? "adhoc";
    const videoName =
      data.payload.video_name ??
      `${(data.videoTaskId ?? "adhoc").slice(0, 24)}_${Date.now().toString(36)}`;

    const base = {
      guid: "WAN" as const,
      project_id: projectId,
      num_videos: 1,
      video_name: videoName,
      prompt: data.payload.prompt,
      aspect_ratio: aspect,
    };

    let body: Record<string, unknown>;
    if (data.route === "text-to-video") {
      body = { ...base };
    } else if (data.route === "first-frame-to-video") {
      if (!data.payload.image_url) {
        throw new Error("[submit_failed] first-frame-to-video 缺少 image_url");
      }
      body = { ...base, image_url: data.payload.image_url };
    } else {
      const urls = (data.payload.image_urls ?? []).slice(0, 3);
      if (urls.length === 0) {
        throw new Error(
          "[submit_failed] reference-image-to-video 缺少 image_urls",
        );
      }
      body = { ...base, image_urls: urls };
    }

    const envelope = await callWan<WanCreateResp>(ROUTE_PATH[data.route], body);
    const ops = envelope.operations ?? [];
    const taskName = ops[0]?.operation?.name;
    if (!taskName) {
      const cls = classifyWanError(envelope.error || JSON.stringify(envelope));
      throw new Error(
        `[${cls.code}] ${cls.message} :: ${cls.upstream.slice(0, 400)}`,
      );
    }

    const { error } = await supabaseAdmin.from("wan_jobs").insert({
      task_id: taskName,
      user_id: userId,
      video_task_id: data.videoTaskId ?? null,
      route: ROUTE_DBKEY[data.route],
      status: "pending",
      operations: ops as unknown as never,
      request_payload: body as unknown as never,
    });
    if (error) console.error("[wan] insert job failed", error);

    return {
      taskId: taskName,
      operations: ops,
      videoName,
      projectId,
      aspectRatio: aspect,
    };
  });

const PollInput = z.object({
  operations: z.array(z.any()).min(1),
  videoName: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  aspectRatio: z
    .enum([
      "VIDEO_ASPECT_RATIO_LANDSCAPE",
      "VIDEO_ASPECT_RATIO_PORTRAIT",
      "VIDEO_ASPECT_RATIO_SQUARE",
    ])
    .optional(),
});

/** 轮询 WAN 任务，成功后落 assets 表 + 更新 wan_jobs/video_tasks。 */
export const pollVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PollInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const ops = data.operations as WanOperation[];
    const taskName = ops[0]?.operation?.name;
    if (!taskName) throw new Error("operations[0].operation.name missing");

    const { data: job } = await supabaseAdmin
      .from("wan_jobs")
      .select("task_id, user_id, video_task_id, asset_id, status, oss_url")
      .eq("task_id", taskName)
      .maybeSingle();
    if (!job || job.user_id !== userId) throw new Error("Task not found");

    if (job.status === "success" && job.oss_url) {
      return {
        status: "success" as const,
        progress: 100,
        ossUrl: job.oss_url,
        operations: ops,
        assetId: job.asset_id,
        errorCode: null,
        errorMessage: null,
      };
    }

    const envelope = await callWan<WanCheckResp>(
      "/video-base/check-video-status",
      {
        guid: "WAN",
        project_id: data.projectId,
        video_name: data.videoName,
        aspect_ratio: data.aspectRatio ?? "VIDEO_ASPECT_RATIO_LANDSCAPE",
        operations: ops,
      },
    );

    // 失败
    if (envelope.finished && envelope.all_error) {
      const raw = envelope.error_message ?? "";
      const cls = classifyWanError(raw);
      await supabaseAdmin
        .from("wan_jobs")
        .update({
          status: "failed",
          raw: envelope as unknown as never,
          error_message: cls.message,
        })
        .eq("task_id", taskName);
      if (job.video_task_id) {
        await supabaseAdmin
          .from("video_tasks")
          .update({ status: "failed" })
          .eq("id", job.video_task_id);
      }
      return {
        status: "failed" as const,
        progress: 0,
        ossUrl: null,
        operations: envelope.result?.operations ?? ops,
        assetId: job.asset_id ?? null,
        errorCode: cls.code,
        errorMessage: cls.message,
      };
    }

    const nextOps = envelope.result?.operations ?? ops;
    const op0 = nextOps[0];
    const ossUrl = op0?.qiniuVideoUrl ?? null;
    const upstreamStatus = (op0?.status ?? "").toUpperCase();
    const success =
      envelope.finished === true &&
      (!!ossUrl ||
        upstreamStatus === "MEDIA_GENERATION_STATUS_SUCCESSFUL");

    if (success && ossUrl) {
      let assetId = job.asset_id ?? null;
      const { data: claimed } = await supabaseAdmin
        .from("wan_jobs")
        .update({
          status: "success",
          progress: 100,
          oss_url: ossUrl,
          operations: nextOps as unknown as never,
          raw: envelope as unknown as never,
        })
        .eq("task_id", taskName)
        .is("oss_url", null)
        .select("task_id")
        .maybeSingle();

      if (claimed) {
        const { data: asset, error: assetErr } = await supabaseAdmin
          .from("assets")
          .insert({
            user_id: userId,
            task_id: job.video_task_id ?? null,
            kind: "video",
            url: ossUrl,
            source: "wan",
            stage: "life",
            meta: { wan_task_id: taskName },
          })
          .select("id")
          .single();
        if (assetErr) {
          console.error("[wan] insert asset failed", assetErr);
        } else {
          assetId = asset.id;
          await supabaseAdmin
            .from("wan_jobs")
            .update({ asset_id: assetId })
            .eq("task_id", taskName);
        }
      } else {
        const { data: refreshed } = await supabaseAdmin
          .from("wan_jobs")
          .select("asset_id")
          .eq("task_id", taskName)
          .maybeSingle();
        assetId = refreshed?.asset_id ?? assetId;
      }

      if (job.video_task_id) {
        await supabaseAdmin
          .from("video_tasks")
          .update({ status: "success" })
          .eq("id", job.video_task_id);
      }

      return {
        status: "success" as const,
        progress: 100,
        ossUrl,
        operations: nextOps,
        assetId,
        errorCode: null,
        errorMessage: null,
      };
    }

    // processing — 把最新 operations 写回 wan_jobs
    await supabaseAdmin
      .from("wan_jobs")
      .update({
        status: "processing",
        operations: nextOps as unknown as never,
        raw: envelope as unknown as never,
      })
      .eq("task_id", taskName);

    return {
      status: "processing" as const,
      progress: 0,
      ossUrl: null,
      operations: nextOps,
      assetId: job.asset_id ?? null,
      errorCode: null,
      errorMessage: null,
    };
  });
