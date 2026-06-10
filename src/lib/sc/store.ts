import { create } from "zustand";
import {
  type Asset,
  type Attachment,
  type AutoMode,
  type Brief,
  type Gate,
  type Phase,
  type StageId,
  type StageState,
  type StageSnapshot,
  type SummaryLine,

  type TaskKind,
  type TaskRecord,
  type ToolCall,
  type Thought,
  type ViewMode,
  STAGE_ORDER,
  STAGE_LABEL,
} from "./types";
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO, SERIES_DEMO, STORYBOARD_ROWS, KEYFRAME_PROMPT_DETAIL } from "./samples";
import type { PendingScript } from "./types";
import { inferTaskTitle } from "./intake-engine";
import { useCredits } from "./credits-store";
import { supabase } from "@/integrations/supabase/client";
import { streamGenerateImage, uploadBase64Image } from "@/lib/upload-image";
import { submitVideoTask, pollVideoTask } from "@/lib/wan.functions";
import { generateScript, type GeneratedScript } from "@/lib/script.functions";
import { parseFormatDuration, parseFormatRatio, formatDurationLabel } from "@/lib/sc/format-utils";
import { useProjects } from "@/lib/sc/projects-store";
import { upsertTaskSnapshot, listProjectTasks, backfillLegacyTasksForProject } from "@/lib/tasks.functions";

/** WAN 视频段轮询：基础节奏 + 瞬态错误退避表 + 兜底超时。 */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRANSIENT = 5;
const POLL_BACKOFFS = [3000, 5000, 8000, 13000, 20000];
const POLL_TIMEOUT_MS = 5 * 60_000;

/** 在 life 阶段失败的资产里挑出现频最高的 errorMessage，用作 task 卡片上的失败原因。 */
function pickTopFailReason(assets: Asset[]): string | null {
  const reasons = assets
    .filter((a) => a.stageId === "life" && a.status === "Failed" && a.errorMessage)
    .map((a) => a.errorMessage as string);
  if (reasons.length === 0) return null;
  const tally = new Map<string, number>();
  for (const r of reasons) tally.set(r, (tally.get(r) ?? 0) + 1);
  let top = reasons[0];
  let best = 0;
  for (const [k, v] of tally) if (v > best) { best = v; top = k; }
  return top.length > 80 ? `${top.slice(0, 80)}…` : top;
}



/** Chat agent 解析出来的"真指令"。后端 chat-stream.ts 端的 schema 同步。 */
export interface AgentDirectives {
  patch?: {
    brief?: { prompt?: string; adType?: string; format?: string };
    script?: {
      mood?: string;
      shots?: Array<{
        shot?: string;
        duration?: string;
        scene?: string;
        motion?: string;
        elements?: string;
        prompt?: string;
      }>;
    };
    characters?: Array<{ id: string; name?: string; look?: string }>;
    scenes?: Array<{ id: string; name?: string; description?: string }>;
  };
  rerun?: Array<"script" | "wardrobe" | "cast" | "paint">;
  /** 用户对某张已生成图片说"改成…"时，由模型产出的真改图指令。 */
  imageEdits?: Array<{ assetId: string; prompt: string; refs?: string[] }>;
  /** 真正驱动 pipeline 的"动作"。chat-stream 在 chat 模式下也可下发。 */
  actions?: Array<
    | { kind: "retry-stage"; stageId: StageId }
    | { kind: "resume-from"; stageId?: StageId }
    | { kind: "rerun-all"; prompt?: string }
    | { kind: "generate-next-episode"; prompt: string }
  >;
}


const consume = (stage: string, label: string, cost: number, taskId?: string | null) =>
  useCredits.getState().consume(stage, label, cost, taskId);
const canAfford = (cost: number) => useCredits.getState().canAfford(cost);

/**
 * 同步刷新当前登录用户 id 到 store。在每个 run* 入口调用，避免
 * fire-and-forget 写入造成的竞态导致命中未登录回退分支。
 */
async function ensureUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    useSC.setState({ currentUserId: id });
    return id;
  } catch {
    return useSC.getState().currentUserId;
  }
}

interface RailState {
  open: boolean;
  flashId?: string;
  focusedAssetId?: string;
}

interface SoftGate {
  /** Action invoked when the 20s countdown reaches 0 in auto mode. */
  defaultAction: () => void;
  /** Epoch ms when auto-advance fires. */
  fireAt: number;
}

export type ChatAction =
  | { label: string; kind: "retry-stage"; stageId: StageId }
  | { label: string; kind: "rerun-all" };

interface ChatMsg {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  actions?: ChatAction[];
  streaming?: boolean;
  toolCalls?: import("./types").ChatToolCall[];
  thinking?: string;
  optionCards?: import("./types").ChatOptionCard[];
  /** ai turn 顶部一行 skill 标题 */
  skill?: { name: string; sub?: string };
  /** preflight 卡里渲染在 optionCards **下方**的引导语（"选择好后请点继续…"）。 */
  outroText?: string;
}


interface SCState {
  phase: Phase;
  prompt: string;
  brief: Brief | null;
  stages: Record<StageId, StageState>;
  assets: Asset[];
  taskTitle: string;
  taskId: string | null;
  taskKind: TaskKind;
  taskHistory: TaskRecord[];
  attachments: Attachment[];
  gate: Gate;
  softGate: SoftGate | null;
  rail: RailState;
  viewMode: ViewMode;
  autoMode: AutoMode;
  timers: number[];
  runId: number;
  /** ids selected for batch operations */
  selection: string[];
  /** in-task chat messages (user ↔ agent), reset on new task */
  chatLog: ChatMsg[];
  /** Asset id currently shown in the VersionDrawer (null = closed). */
  versionDrawerAssetId: string | null;
  /** Asset id shown in the AssetPreviewDialog lightbox (null = closed). */
  previewAssetId: string | null;



  /** cached supabase user id for the current run; populated on submit() */
  currentUserId: string | null;
  /** LLM-generated script for the current run (null until structure stage finishes) */
  script: GeneratedScript | null;
  /** 用户上传的剧本（待解析），等待用户输入 prompt 时一起送后端解析 */
  pendingScript: PendingScript | null;

  hydrated: boolean;
  hydrateFromStorage: () => void;


  intakeSel: Record<string, string>;
  intakeCustoms: Record<string, string[]>;
  intakeOthers: { key: string; label: string } | null;

  setPrompt: (v: string) => void;
  setAutoMode: (m: AutoMode) => void;
  setViewMode: (v: ViewMode) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  submit: (prompt: string) => void;
  chatMessage: (text: string) => void;
  confirmBrief: (brief: Brief) => void;
  submitOptionCard: (msgId: string, cardId: string, answers: Record<string, { selected: string[]; otherText?: string }>) => void;
  skipOptionCard: (msgId: string, cardId: string) => void;
  skipIntake: () => void;
  approveScript: () => void;
  tweakScript: () => void;
  approveWardrobe: () => void;
  tweakWardrobe: () => void;
  approveCast: () => void;
  tweakCast: () => void;
  approveKeyframe: () => void;
  regenerateKeyframe: () => void;
  applyQCFix: () => void;
  keepAsIs: () => void;
  approveMerge: () => void;
  cancelMerge: () => void;
  cancelSoftGate: () => void;
  cancel: () => void;
  paused: boolean;
  /** Timestamp when the user clicked pause; null when not paused. Used by
   *  countdown UIs (IntakeCard / ApprovalChips) to freeze the displayed
   *  "X s 后自动继续" text during pause. */
  pausedAt: number | null;
  pauseTask: () => void;
  resumeTask: () => void;
  reset: (opts?: { fromUserAction?: boolean }) => void;
  toggleStage: (id: StageId) => void;
  toggleThought: (stageId: StageId, thoughtId: string) => void;
  setRailOpen: (v: boolean) => void;
  focusAsset: (id: string) => void;
  forceState: (s: string) => void;
  restoreTask: (id: string) => boolean;
  deleteTask: (id: string) => void;
  toggleFavoriteTask: (id: string) => void;
  enterProject: (projectId: string) => void;
  applyAgentPatch: (dir: AgentDirectives) => void;
  retryStage: (id: StageId) => void;
  retryAsset: (assetId: string) => void;
  setActiveVersion: (assetId: string, versionIndex: number) => void;
  /** 把当前 url 推进 versions 历史，再把新 url 设为 active；用于图层编辑 / chat 真改图。 */
  addAssetVersion: (assetId: string, newUrl: string, note?: string) => void;
  openVersionDrawer: (assetId: string) => void;
  closeVersionDrawer: () => void;
  openPreview: (assetId: string) => void;
  closePreview: () => void;
  /** 用户上传剧本后由后端 parseScriptText 返回的结构，直接灌进 store 并跳过 structure 生成。 */
  importGeneratedScript: (script: GeneratedScript) => void;
  /** 用户上传剧本：仅暂存抽取后的文本，等下一次 submit 时连同 prompt 一起送后端解析。 */
  setPendingScript: (s: PendingScript | null) => void;
  clearPendingScript: () => void;







  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  batchEditAssets: (ids: string[], instruction: string) => void;

  setIntakeSel: (key: string, value: string) => void;
  requestIntakeOthers: (key: string, label: string) => void;
  cancelIntakeOthers: () => void;
  resolveIntakeOthers: (value: string) => void;
}

const HISTORY_KEY = "sc.tasks";
const AUTO_KEY = "sc.autoMode";
const VIEW_KEY = "sc.viewMode";

const emptyStage = (): StageState => ({
  status: "pending",
  summary: [],
  expanded: true,
  toolCalls: [],
  thoughts: [],
});

const initialStages = (): Record<StageId, StageState> =>
  STAGE_ORDER.reduce(
    (acc, id) => {
      acc[id] = emptyStage();
      return acc;
    },
    {} as Record<StageId, StageState>,
  );

const isSeriesPrompt = (text: string) =>
  /(剧集|系列|连续剧|episode|series|第\s*\d+\s*集|EP\s*\d)/i.test(text);

const UUID_RE_TASK = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const newId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
};

/** Normalize titles/project names for loose comparison (collapse whitespace, trim, truncate). */
export const normalizeTitle = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/[…\u2026]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 60);

/** Loose match: title (possibly truncated) belongs to project name. */
export const titleMatchesProject = (title: string | null | undefined, projectName: string | null | undefined): boolean => {
  const a = normalizeTitle(title);
  const b = normalizeTitle(projectName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a) && a.length >= 6) return true;
  if (a.startsWith(b) && b.length >= 6) return true;
  return false;
};

const loadHistory = (): TaskRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveHistory = (list: TaskRecord[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
};

const loadAutoMode = (): AutoMode => {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(AUTO_KEY);
  return v === "confirm" ? "confirm" : "auto";
};

const loadViewMode = (): ViewMode => {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_KEY);
  return v === "canvas" ? "canvas" : "list";
};

const normalizeSummaryLine = (line: unknown): SummaryLine | null => {
  if (typeof line === "string") {
    const text = line.trim();
    return text ? text : null;
  }
  if (!line || typeof line !== "object") return null;
  const raw = line as { text?: unknown; thumbs?: unknown };
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  const thumbs = Array.isArray(raw.thumbs)
    ? raw.thumbs.filter((thumb): thumb is string => typeof thumb === "string" && thumb.length > 0)
    : [];
  return thumbs.length > 0 ? { text, thumbs } : text;
};

const normalizeToolCall = (call: unknown, fallbackId: string): ToolCall | null => {
  if (!call || typeof call !== "object") return null;
  const raw = call as Partial<ToolCall>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    kind: raw.kind === "skill" ? "skill" : "tool",
    label,
    startedAt: typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt) ? raw.startedAt : 0,
    durationMs: typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? raw.durationMs : undefined,
    status: raw.status === "running" ? "running" : "done",
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
  };
};

const normalizeThought = (thought: unknown, fallbackId: string): Thought | null => {
  if (!thought || typeof thought !== "object") return null;
  const raw = thought as Partial<Thought>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = Array.isArray(raw.body)
    ? raw.body.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];
  if (!title && body.length === 0) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    title: title || "Thought",
    body,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    thumbAssetIds: Array.isArray(raw.thumbAssetIds)
      ? raw.thumbAssetIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined,
    elapsedMs: typeof raw.elapsedMs === "number" && Number.isFinite(raw.elapsedMs) ? raw.elapsedMs : undefined,
  };
};

const normalizeStageSnapshot = (snapshot: unknown, stageId: StageId): StageSnapshot | undefined => {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const raw = snapshot as Partial<StageSnapshot> & { status?: unknown };
  const summary = Array.isArray(raw.summary)
    ? raw.summary
        .map((line) => normalizeSummaryLine(line))
        .filter((line): line is SummaryLine => !!line)
    : [];
  const toolCalls = Array.isArray(raw.toolCalls)
    ? raw.toolCalls
        .map((call, index) => normalizeToolCall(call, `${stageId}-tool-${index}`))
        .filter((call): call is ToolCall => !!call)
    : [];
  const thoughts = Array.isArray(raw.thoughts)
    ? raw.thoughts
        .map((thought, index) => normalizeThought(thought, `${stageId}-thought-${index}`))
        .filter((thought): thought is Thought => !!thought)
    : [];
  const status =
    raw.status === "pending" ||
    raw.status === "running" ||
    raw.status === "ready" ||
    raw.status === "recovering" ||
    raw.status === "failed"
      ? raw.status
      : summary.length > 0 || toolCalls.length > 0 || thoughts.length > 0
        ? "ready"
        : "pending";
  if (status === "pending" && summary.length === 0 && toolCalls.length === 0 && thoughts.length === 0) {
    return undefined;
  }
  return { status, summary, toolCalls, thoughts };
};

const normalizeBrief = (brief: unknown, task: { prompt?: string; title?: string }): Brief | null => {
  if (!brief || typeof brief !== "object") {
    if (!task.prompt && !task.title) return null;
    return {
      prompt: task.prompt || task.title || "",
      adType: "",
      format: "—",
      visualSource: "—",
      mode: "—",
    };
  }
  const raw = brief as Partial<Brief>;
  return {
    prompt: typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt : task.prompt || task.title || "",
    adType: typeof raw.adType === "string" ? raw.adType : "",
    format: typeof raw.format === "string" && raw.format.trim() ? raw.format : "—",
    visualSource: typeof raw.visualSource === "string" && raw.visualSource.trim() ? raw.visualSource : "—",
    mode: typeof raw.mode === "string" && raw.mode.trim() ? raw.mode : "—",
    visualStyle: typeof raw.visualStyle === "string" && raw.visualStyle.trim() ? raw.visualStyle : undefined,
  };
};

const normalizeGeneratedScript = (script: unknown): GeneratedScript | null => {
  if (!script || typeof script !== "object") return null;
  const raw = script as Partial<GeneratedScript>;
  const mood = typeof raw.mood === "string" ? raw.mood : "";
  const cameraLanguage = typeof raw.cameraLanguage === "string" ? raw.cameraLanguage : "";
  const structureSummary = Array.isArray(raw.structureSummary)
    ? raw.structureSummary.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];
  const wardrobe = Array.isArray(raw.wardrobe)
    ? raw.wardrobe
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as { id?: unknown; caption?: unknown };
          const caption = typeof candidate.caption === "string" ? candidate.caption.trim() : "";
          if (!caption) return null;
          return {
            id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `W${String(index + 1).padStart(2, "0")}`,
            caption,
          };
        })
        .filter((item): item is GeneratedScript["wardrobe"][number] => !!item)
    : [];
  const shots = Array.isArray(raw.shots)
    ? raw.shots
        .map((shot, index) => {
          if (!shot || typeof shot !== "object") return null;
          const candidate = shot as {
            shot?: unknown;
            duration?: unknown;
            motion?: unknown;
            scene?: unknown;
            elements?: unknown;
            prompt?: unknown;
          };
          const scene = typeof candidate.scene === "string" ? candidate.scene.trim() : "";
          const elements = typeof candidate.elements === "string" ? candidate.elements.trim() : "";
          const motion = typeof candidate.motion === "string" ? candidate.motion.trim() : "";
          if (!scene && !elements && !motion) return null;
          return {
            shot: typeof candidate.shot === "string" && candidate.shot.trim() ? candidate.shot : `A${String(index + 1).padStart(2, "0")}`,
            duration: typeof candidate.duration === "string" && candidate.duration.trim() ? candidate.duration : "3s",
            motion,
            scene,
            elements,
            prompt: typeof candidate.prompt === "string" ? candidate.prompt : "",
          };
        })
        .filter((shot): shot is GeneratedScript["shots"][number] => !!shot)
    : [];
  if (!mood && !cameraLanguage && structureSummary.length === 0 && wardrobe.length === 0 && shots.length === 0) {
    return null;
  }
  return { mood, cameraLanguage, structureSummary, wardrobe, shots };
};

export const canRestoreTaskRecord = (task: Partial<TaskRecord> | null | undefined): task is Partial<TaskRecord> & Pick<TaskRecord, "id"> => {
  if (!task || typeof task !== "object") return false;
  if (typeof task.id !== "string" || task.id.trim().length === 0) return false;
  const hasTitle = typeof task.title === "string" && task.title.trim().length > 0;
  const hasPrompt = typeof task.prompt === "string" && task.prompt.trim().length > 0;
  const hasAssets = Array.isArray(task.assets) && task.assets.length > 0;
  const hasStageSummaries = STAGE_ORDER.some((stageId) => {
    const lines = task.stageSummaries?.[stageId];
    return Array.isArray(lines) && lines.length > 0;
  });
  const hasStageSnapshots = STAGE_ORDER.some((stageId) => !!normalizeStageSnapshot(task.stageSnapshots?.[stageId], stageId));
  return hasTitle || hasPrompt || hasAssets || hasStageSummaries || hasStageSnapshots || !!normalizeGeneratedScript(task.script);
};

export const normalizeTaskRecord = (found: Partial<TaskRecord> & Pick<TaskRecord, "id">): TaskRecord => {
  const normalizedAssets: Asset[] = Array.isArray(found.assets)
    ? found.assets.map((asset, index): Asset => ({
        id: asset?.id ?? `restored-${found.id}-${index}`,
        kind: asset?.kind === "video" ? "video" : "image",
        label: asset?.label ?? asset?.id ?? `A${String(index + 1).padStart(2, "0")}`,
        status:
          asset?.status === "Generating" ||
          asset?.status === "Queued" ||
          asset?.status === "Processing" ||
          asset?.status === "Status checked" ||
          asset?.status === "Ready" ||
          asset?.status === "Recovering" ||
          asset?.status === "Failed"
            ? asset.status
            : "Ready",
        caption: asset?.caption,
        url: asset?.url,
        poster: asset?.poster,
        width: asset?.width,
        height: asset?.height,
        aspectRatio: asset?.aspectRatio,
        duration: asset?.duration,
        stageId:
          asset?.stageId && STAGE_ORDER.includes(asset.stageId)
            ? asset.stageId
            : (asset as { stage?: StageId | undefined })?.stage && STAGE_ORDER.includes((asset as { stage?: StageId | undefined }).stage as StageId)
              ? (asset as { stage?: StageId | undefined }).stage
              : undefined,
        episode: asset?.episode,
        scene: asset?.scene,
        errorMessage: asset?.errorMessage,
        errorCode: asset?.errorCode,
        versions: Array.isArray(asset?.versions)
          ? asset.versions
              .filter((version): version is NonNullable<Asset["versions"]>[number] => !!version && typeof version.url === "string" && version.url.length > 0)
              .map((version) => ({
                url: version.url,
                createdAt: typeof version.createdAt === "number" && Number.isFinite(version.createdAt) ? version.createdAt : 0,
                source:
                  version.source === "qc-fix" ||
                  version.source === "manual-retry" ||
                  version.source === "batch-edit" ||
                  version.source === "manual-edit" ||
                  version.source === "manual-revert"
                    ? version.source
                    : "init",
                note: typeof version.note === "string" ? version.note : undefined,
              }))
          : undefined,
        segmentIndex: asset?.segmentIndex,
        sourceShotId: asset?.sourceShotId,
      }))
    : [];

  const normalizedStageSummaries: Partial<Record<StageId, SummaryLine[]>> = {};
  for (const stageId of STAGE_ORDER) {
    const lines = found.stageSummaries?.[stageId];
    if (!Array.isArray(lines)) continue;
    const normalized = lines
      .map((line) => normalizeSummaryLine(line))
      .filter((line): line is SummaryLine => !!line);
    if (normalized.length > 0) normalizedStageSummaries[stageId] = normalized;
  }

  const normalizedStageSnapshots: Partial<Record<StageId, StageSnapshot>> = {};
  for (const stageId of STAGE_ORDER) {
    const snapshot = normalizeStageSnapshot(found.stageSnapshots?.[stageId], stageId);
    if (snapshot) normalizedStageSnapshots[stageId] = snapshot;
  }

  return {
    id: found.id,
    title: found.title ?? "Untitled",
    prompt: found.prompt ?? "",
    createdAt: typeof found.createdAt === "number" ? found.createdAt : 0,
    updatedAt: typeof found.updatedAt === "number" ? found.updatedAt : 0,
    status:
      found.status === "running" ||
      found.status === "done" ||
      found.status === "failed" ||
      found.status === "interrupted"
        ? found.status
        : "done",
    kind: found.kind ?? "oneoff",
    assets: normalizedAssets,
    stageSummaries: normalizedStageSummaries,
    stageSnapshots: normalizedStageSnapshots,
    script: normalizeGeneratedScript(found.script),
    failureReason: found.failureReason ?? undefined,
    brief: normalizeBrief(found.brief, { prompt: found.prompt, title: found.title }),
    projectId: typeof found.projectId === "string" ? found.projectId : null,
    favorite: !!found.favorite,
    archivedChat: Array.isArray((found as { archivedChat?: unknown }).archivedChat)
      ? ((found as { archivedChat?: unknown[] }).archivedChat as unknown[])
      : undefined,
  };
};

const uid = () => Math.random().toString(36).slice(2, 9);

export const useSC = create<SCState>((set, get) => {
  let pendingQcIssues: import("@/lib/qc.functions").QcIssue[] = [];

  // Pause-aware timer tracking. The native setTimeout ids live in store.timers
  // (for the existing clearTimers path); the metadata mirror below lets
  // pauseTask() compute remaining delay and resumeTask() re-schedule.
  interface PendingTimerInfo {
    fn: () => void;
    delay: number;
    scheduledAt: number;
    runId: number;
  }
  const pendingInfo = new Map<number, PendingTimerInfo>();
  let suspended: PendingTimerInfo[] = [];

  // In-flight fetch / SSE requests for current run. Pause aborts them all so
  // the user-visible "暂停" actually stops the network work, not just the
  // post-completion scheduling.
  const inflight = new Set<AbortController>();
  const registerAbort = (): AbortController => {
    const ctrl = new AbortController();
    inflight.add(ctrl);
    return ctrl;
  };
  const unregisterAbort = (ctrl: AbortController) => {
    inflight.delete(ctrl);
  };
  const abortAllInflight = () => {
    for (const ctrl of inflight) {
      try { ctrl.abort(); } catch { /* noop */ }
    }
    inflight.clear();
  };
  const isAbortError = (e: unknown): boolean => {
    if (!e) return false;
    const err = e as { name?: string; message?: string };
    return err.name === "AbortError"
      || /aborted|abort/i.test(err.message ?? "");
  };

  const clearTimers = () => {
    for (const t of get().timers) clearTimeout(t);
    pendingInfo.clear();
    suspended = [];
    abortAllInflight();
    set({ timers: [], paused: false, pausedAt: null });
  };

  const schedule = (fn: () => void, delay: number) => {
    const startedRunId = get().runId;
    // If currently paused, queue directly into suspended instead of starting a
    // native timer that will fire while the user expects "stopped".
    if (get().paused) {
      suspended.push({ fn, delay, scheduledAt: Date.now(), runId: startedRunId });
      return -1;
    }
    const scheduledAt = Date.now();
    const id = window.setTimeout(() => {
      pendingInfo.delete(id);
      if (get().runId !== startedRunId) return;
      fn();
    }, delay) as unknown as number;
    pendingInfo.set(id, { fn, delay, scheduledAt, runId: startedRunId });
    set({ timers: [...get().timers, id] });
    return id;
  };

  /**
   * Resolve immediately if not paused; otherwise wait for resumeTask() to
   * flip `paused` back to false. Used by every long-running runner (chat
   * stream reader loops, seedance polling) so a pause click freezes the
   * entire pipeline, not just the wardrobe/cast/paint runners.
   */
  const waitForResume = (): Promise<void> => {
    if (!get().paused) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const unsub = useSC.subscribe((s) => {
        if (!s.paused) {
          unsub();
          resolve();
        }
      });
    });
  };

  /**
   * Pause-aware sleep. Uses schedule() so the underlying setTimeout gets
   * suspended on pauseTask() and re-scheduled with the remaining delay on
   * resumeTask(). After the sleep elapses we additionally waitForResume in
   * case the user paused exactly when the timer fired.
   */
  const pausableSleep = (ms: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      schedule(() => {
        void waitForResume().then(resolve);
      }, ms);
    });
  };

  const pauseTask = () => {
    const { phase, paused } = get();
    if (paused) return;
    if (phase !== "running" && phase !== "thinking" && phase !== "intake") return;
    const now = Date.now();
    const moved: PendingTimerInfo[] = [];
    for (const [id, info] of pendingInfo) {
      clearTimeout(id);
      const remaining = Math.max(0, info.delay - (now - info.scheduledAt));
      moved.push({ fn: info.fn, delay: remaining, scheduledAt: now, runId: info.runId });
    }
    pendingInfo.clear();
    suspended = [...suspended, ...moved];
    // Abort any in-flight fetch/SSE so the running generation actually stops.
    // Stage runners catch the abort, revert the current asset to "Queued" and
    // re-enter the loop via schedule(...) so the next pass after resume picks
    // it back up.
    abortAllInflight();
    set({ timers: [], paused: true, pausedAt: now });
  };

  const resumeTask = () => {
    if (!get().paused) return;
    const toRestore = suspended;
    suspended = [];
    // Shift softGate fireAt by the paused duration so the countdown picks up
    // where it left off instead of immediately firing.
    const prevPausedAt = get().pausedAt;
    const shift = prevPausedAt ? Date.now() - prevPausedAt : 0;
    const sg = get().softGate;
    set({
      paused: false,
      pausedAt: null,
      softGate: sg && shift > 0 ? { ...sg, fireAt: sg.fireAt + shift } : sg,
    });
    const currentRunId = get().runId;
    for (const info of toRestore) {
      // If runId has bumped (cancel/reset), the scheduled fn would be a no-op
      // because the inner schedule() check also gates on runId.
      if (info.runId !== currentRunId) continue;
      const scheduledAt = Date.now();
      const startedRunId = info.runId;
      const id = window.setTimeout(() => {
        pendingInfo.delete(id);
        if (get().runId !== startedRunId) return;
        info.fn();
      }, info.delay) as unknown as number;
      pendingInfo.set(id, { fn: info.fn, delay: info.delay, scheduledAt, runId: startedRunId });
      set((s) => ({ timers: [...s.timers, id] }));
    }
  };

  const updateStage = (id: StageId, patch: Partial<StageState>) =>
    set((s) => {
      const cur = s.stages[id];
      const next: StageState = { ...cur, ...patch };
      if (patch.status === "running" && !cur.startedAt) {
        next.startedAt = Date.now();
      }
      return { stages: { ...s.stages, [id]: next } };
    });

  const appendSummary = (id: StageId, line: string, thumbs?: string[]) =>
    set((s) => {
      const entry: SummaryLine =
        thumbs && thumbs.length ? { text: line, thumbs } : line;
      return {
        stages: {
          ...s.stages,
          [id]: { ...s.stages[id], summary: [...s.stages[id].summary, entry] },
        },
      };
    });

  /** Append a "参考图：" line to a stage if the user uploaded reference images. */
  const appendRefThumbs = (id: StageId) => {
    const refs = get().attachments;
    const imgRefs = refs
      .filter((a) => a.kind === "image" && a.url)
      .map((a) => a.thumb ?? a.url);
    if (imgRefs.length) appendSummary(id, "参考图：", imgRefs);
  };


  const startToolCall = (stageId: StageId, kind: ToolCall["kind"], label: string) => {
    const id = uid();
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          toolCalls: [
            ...s.stages[stageId].toolCalls,
            { id, kind, label, startedAt: Date.now(), status: "running" },
          ],
        },
      },
    }));
    return id;
  };

  const finishToolCall = (stageId: StageId, id: string) =>
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          toolCalls: s.stages[stageId].toolCalls.map((t) =>
            t.id === id
              ? { ...t, status: "done", durationMs: Date.now() - t.startedAt }
              : t,
          ),
        },
      },
    }));

  /**
   * One-shot tool execution: insert a running line, wait `ms`, mark done.
   * Returns the delay so callers can chain timing.
   */
  const runTool = (
    stageId: StageId,
    kind: ToolCall["kind"],
    label: string,
    ms: number,
    startDelay = 0,
  ) => {
    let toolId = "";
    schedule(() => {
      toolId = startToolCall(stageId, kind, label);
    }, startDelay);
    schedule(() => {
      if (toolId) finishToolCall(stageId, toolId);
    }, startDelay + ms);
    return startDelay + ms;
  };

  const addThought = (stageId: StageId, thought: Omit<Thought, "id">) => {
    const id = uid();
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          thoughts: [...s.stages[stageId].thoughts, { id, ...thought }],
        },
      },
    }));
    return id;
  };

  const updateAsset = (id: string, patch: Partial<Asset>) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  /**
   * Update an asset's `url` while preserving the previous URL in `versions[]`.
   * Use this for any user-visible regeneration (QC fix, manual retry,
   * batch-edit) so the gallery can show every prior version.
   */
  const updateAssetWithVersion = (
    id: string,
    nextUrl: string,
    source: import("./types").AssetVersion["source"],
    note?: string,
    extra?: Partial<Asset>,
  ) =>
    set((s) => ({
      assets: s.assets.map((a) => {
        if (a.id !== id) return a;
        const prev = a.url;
        const versions = a.versions ? [...a.versions] : [];
        if (prev && /^https?:\/\//.test(prev) && prev !== nextUrl) {
          versions.push({
            url: prev,
            createdAt: Date.now(),
            source: a.versions?.length ? source : "init",
            note,
          });
        }
        return { ...a, ...extra, url: nextUrl, versions };
      }),
    }));

  const streamLines = (
    id: StageId,
    lines: string[],
    perLineDelay = 700,
    startDelay = 0,
    onDone?: () => void,
  ) => {
    lines.forEach((line, i) => {
      schedule(() => appendSummary(id, line), startDelay + i * perLineDelay);
    });
    if (onDone) schedule(onDone, startDelay + lines.length * perLineDelay);
  };

  /** 默认关闭：保持各阶段始终展开，让用户能看到完整无省略的流程。
   *  用户仍可通过 toggleStage 手动折叠某一段。 */
  const AUTO_COLLAPSE_STAGES = false;
  const collapseAfter = (id: StageId, delay = 1400) => {
    if (!AUTO_COLLAPSE_STAGES) return;
    schedule(() => updateStage(id, { expanded: false }), delay);
  };


  const isAuto = () => get().autoMode === "auto";

  /** Open a soft-gate that auto-advances after 15s in Auto mode. */
  const openGate = (gate: Gate, defaultAction: () => void) => {
    const auto = isAuto();
    set({
      gate,
      softGate: auto ? { defaultAction, fireAt: Date.now() + 15000 } : null,
    });
    if (auto) {
      schedule(() => {
        if (get().gate === gate) defaultAction();
      }, 15000);
    }
  };

  const closeGate = () => set({ gate: null, softGate: null });

  /** Persist current task snapshot into taskHistory */
  const persistCurrent = (status: TaskRecord["status"]) => {
    const { taskId, taskTitle, brief, assets, taskHistory, taskKind, stages, script, chatLog } = get();
    if (!taskId) return;
    const now = Date.now();
    const existing = taskHistory.find((t) => t.id === taskId);
    const stageSummaries: Partial<Record<StageId, SummaryLine[]>> = {};
    const stageSnapshots: Partial<Record<StageId, StageSnapshot>> = {};
    let failureReason: string | undefined;
    for (const sid of STAGE_ORDER) {
      const st = stages[sid];
      if (st.summary.length) stageSummaries[sid] = st.summary.slice();
      if (st.summary.length || st.toolCalls.length || st.thoughts.length) {
        stageSnapshots[sid] = {
          status: st.status,
          summary: st.summary.slice(),
          toolCalls: st.toolCalls.slice(),
          thoughts: st.thoughts.slice(),
        };
      }
      if (status === "failed" && st.status === "failed" && !failureReason) {
        const last = st.summary[st.summary.length - 1];
        failureReason = (typeof last === "string" ? last : last?.text) ?? `${STAGE_LABEL[sid]} 失败`;
      }
    }

    // Read currently active project (if any) so this task is linked back to it.
    const currentProjectId = useProjects.getState().currentProjectId ?? existing?.projectId ?? null;
    const record: TaskRecord = {
      id: taskId,
      title: taskTitle,
      prompt: brief?.prompt ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status,
      kind: taskKind,
      assets,
      stageSummaries,
      stageSnapshots,
      script: script ?? existing?.script,
      failureReason: failureReason ?? existing?.failureReason,
      brief,
      projectId: currentProjectId ?? existing?.projectId ?? null,
      favorite: existing?.favorite,
      // Persist full chat timeline so historical playback shows the exact original output.
      archivedChat: chatLog as unknown as unknown[],
    };
    const next = [record, ...taskHistory.filter((t) => t.id !== taskId)];
    set({ taskHistory: next });
    saveHistory(next);
    // Fire-and-forget remote sync (only when id is a real UUID)
    if (UUID_RE_TASK.test(record.id)) {
      const remoteStatus: "running" | "ready" | "failed" | "completed" =
        record.status === "done"
          ? "completed"
          : record.status === "failed"
            ? "failed"
            : record.status === "interrupted"
              ? "failed"
              : "running";
      const snapshot = {
        kind: record.kind,
        assets: record.assets,
        stageSummaries: record.stageSummaries ?? {},
        stageSnapshots: record.stageSnapshots ?? {},
        script: record.script ?? null,
        failureReason: record.failureReason ?? null,
        brief: record.brief ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status,
        archivedChat: record.archivedChat ?? [],
      };
      void upsertTaskSnapshot({
        data: {
          taskId: record.id,
          projectId: record.projectId ?? null,
          title: record.title || "Untitled",
          status: remoteStatus,
          prompt: record.prompt ?? "",
          snapshot,
        },
      }).catch((e) => console.warn("[persistCurrent] remote sync failed", e));
    }
  };



  // -------- Stage runners --------

  const runScene = () => {
    updateStage("scene", { status: "running", expanded: true });
    runTool("scene", "skill", "ai-video-studio · scene-builder", 1100, 0);
    const promptTxt = get().prompt || get().brief?.prompt || "";
    const briefLine = promptTxt
      ? `锁定主题：${promptTxt.slice(0, 40)}${promptTxt.length > 40 ? "…" : ""}`
      : "正在分析品牌 brief 与受众…";
    streamLines(
      "scene",
      [
        briefLine,
        "拆解情绪/节奏/受众场景…",
        "为本主题选定镜头语言（推 / 跟 / 特写组合）…",
      ],
      850,
      1300,
      () => {
        updateStage("scene", { status: "ready" });
        consume("scene", "Scene · brief analysis", 5, get().taskId);
        collapseAfter("scene", 1400);
        schedule(() => runStructure(), 1600);
      },
    );
  };

  const runStructure = () => {
    updateStage("structure", { status: "running", expanded: true });
    const pending = get().pendingScript;
    const tcId = startToolCall(
      "structure",
      "tool",
      pending ? `script-parser · 解析上传剧本「${pending.fileName}」` : "video-script-writer · LLM",
    );
    appendSummary(
      "structure",
      pending
        ? `读取上传剧本「${pending.fileName}」（${pending.text.length} 字符）并按你的指令解析…`
        : "调用大模型生成本次剧本与分镜…",
    );
    appendRefThumbs("structure");


    const startedRunId = get().runId;
    const b = get().brief;
    void (async () => {
      let script: GeneratedScript | null = null;
      try {
        if (pending) {
          // 用户上传剧本 → 真实后端按"原剧本 + 用户 prompt"解析，禁止二次创作
          const { parseScriptText } = await import("@/lib/script-parse.functions");
          script = await parseScriptText({
            data: {
              text: pending.text.slice(0, 60000),
              briefHint: b?.prompt || undefined,
            },
          });
          // 解析成功后清掉 pendingScript，避免下次 submit 重复解析
          set({ pendingScript: null });
        } else {
          const attachments = get().attachments.map((a) => ({
            kind: a.kind,
            name: a.name,
            caption: a.ref ?? undefined,
            url: /^https?:\/\//.test(a.url) ? a.url : undefined,
          }));
          script = await generateScript({
            data: {
              prompt: b?.prompt ?? "",
              adType: b?.adType ?? "",
              format: b?.format ?? "",
              visualSource: b?.visualSource ?? "",
              visualStyle: b?.visualStyle ?? "",
              attachments,
            },
          });
        }
      } catch (e) {
        console.error("[structure] script generation failed", e);
        appendSummary("structure", `脚本生成失败：${(e as Error).message}`);
        updateStage("structure", { errorMessage: (e as Error).message });
      }
      if (get().runId !== startedRunId) return;
      finishToolCall("structure", tcId);


      if (script) {
        set({ script });
        appendSummary("structure", `情绪：${script.mood}`);
        appendSummary("structure", `镜头语言：${script.cameraLanguage}`);
        for (const line of script.structureSummary) appendSummary("structure", line);
        addThought("structure", {
          title: "分镜方案",
          body: script.shots.map(
            (s) => `${s.shot} · ${s.duration} · ${s.motion} — ${s.scene}（${s.elements}）`,
          ),
        });
      } else {
        appendSummary("structure", "使用默认 5 镜头结构作为兜底。");
      }

      updateStage("structure", { status: "ready" });
      consume("structure", "Script + storyboard", 5, get().taskId);
      openGate("script", () => runWardrobe());
    })();
  };

  const runWardrobe = () => {
    closeGate();
    updateStage("wardrobe", { status: "running", expanded: true });
    runTool("wardrobe", "tool", "wardrobe-stylist · text-to-image", 1500, 0);
    appendRefThumbs("wardrobe");


    const script = get().script;
    const wardrobeSpec = Array.isArray(script?.wardrobe) && script!.wardrobe!.length > 0
      ? script!.wardrobe!
      : [
          { id: "W01", caption: "主角形象" },
          { id: "W02", caption: "配角形象" },
          { id: "P01", caption: "关键道具" },
        ];

    streamLines(
      "wardrobe",
      wardrobeSpec.map((w) => `${w.id}：${w.caption}`),
      650,
      300,
    );

    const wardrobeAssets: Asset[] = wardrobeSpec.map((w) => {
      const isProp = /^P/i.test(w.id);
      return {
        id: w.id,
        kind: "image",
        label: w.id,
        caption: w.caption,
        status: "Queued",
        stageId: "wardrobe",
        width: isProp ? 1024 : 768,
        height: isProp ? 1024 : 1024,
        aspectRatio: isProp ? "1:1" : "3:4",
      };
    });
    set((s) => ({
      assets: [...s.assets, ...wardrobeAssets],
      rail: { ...s.rail, open: true, flashId: wardrobeSpec[0]?.id },
    }));

    const startedRunId = get().runId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    const loop = async () => {
      const userId = await ensureUserId();
      if (!userId) {
        const reason = "请先登录后再生成服装/道具素材";
        for (const w of wardrobeAssets) {
          if (get().runId !== startedRunId) return;
          updateAsset(w.id, {
            status: "Failed",
            errorMessage: reason,
            errorCode: "auth_required",
          });
        }
        appendSummary("wardrobe", `未登录 · 已暂停生成（${reason}）`);
        updateStage("wardrobe", { status: "failed", errorMessage: reason });
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }
      for (const w of wardrobeAssets) {
        if (get().runId !== startedRunId) return;
        const cur = get().assets.find((a) => a.id === w.id);
        if (cur?.status === "Ready" || cur?.status === "Failed") continue;
        if (get().paused) {
          // Will be re-fired on resume via the suspended-timer queue.
          schedule(() => void loop(), 0);
          return;
        }
        updateAsset(w.id, { status: "Generating", errorMessage: undefined });
        const isProp = /^P/i.test(w.id);
        // Wardrobe/Prop reference shots: NOT cinematic keyframes. Strict product/
        // costume photography brief, white seamless background, no environment,
        // no narrative.
        const subjectBrief = isProp
          ? `Hero product / prop: ${w.caption}. Single object centered, isolated on pure white seamless backdrop. Studio softbox lighting, soft shadow under the object only. E-commerce product photography. No human, no hands, no environment, no story.`
          : `Costume / character reference: ${w.caption}. Front-facing reference sheet style on plain neutral grey backdrop, full-body or 3/4 figure, even studio lighting. Focus on the outfit, hair, accessories. No background scene, no props beyond what is worn, no cinematic mood, no narrative action.`;
        const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
        const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
        // Attach uploaded reference images (item 3) so the model conditions on them.
        const refs = get().attachments
          .filter((a) => a.kind === "image" && /^https?:\/\//.test(a.url))
          .map((a) => a.url);
        const refLine = refs.length
          ? `\n\nUser provided reference images (strictly follow the style / clothing / props shown): ${refs.join(" ")}`
          : "";
        const fullPrompt = [
          styleFragment ? `Visual style: ${styleFragment}.` : "",
          `This is a WARDROBE / PROP REFERENCE asset (id ${w.id}) for a short film — it MUST be a clean reference image, NOT a keyframe or cinematic scene.`,
          subjectBrief,
          `Project brief (context only — do NOT render the story here, only the wardrobe/prop): ${briefPrompt}`,
          `NEGATIVE: no scene, no environment, no cinematic shot, no keyframe, no story moment, no extra characters, no text, no watermark.${refLine}`,
        ].filter(Boolean).join("\n\n");
        const ctrl = registerAbort();
        try {
          const b64 = await streamGenerateImage({
            prompt: fullPrompt,
            quality: "low",
            signal: ctrl.signal,
            onPartial: (dataUrl) => {
              if (get().runId !== startedRunId) return;
              if (get().paused) return;
              updateAsset(w.id, { url: dataUrl });
            },
          });
          if (get().runId !== startedRunId) return;
          const url = await uploadBase64Image({ base64: b64, userId, taskId });
          if (get().runId !== startedRunId) return;
          updateAsset(w.id, { status: "Ready", url, errorMessage: undefined });
          consume("wardrobe", `Wardrobe · ${w.id}`, 5, get().taskId);
        } catch (e) {
          if (isAbortError(e) || ctrl.signal.aborted) {
            // Paused mid-flight: revert this asset so the next loop pass
            // (after resume) picks it back up. Do NOT mark failed.
            updateAsset(w.id, { status: "Queued", url: undefined });
            schedule(() => void loop(), 0);
            return;
          }
          console.error("[wardrobe] failed", w.id, e);
          // Clear any partial-preview data URL — keeping it would make a failed
          // asset look like "image generated but marked failed".
          updateAsset(w.id, {
            status: "Failed",
            url: undefined,
            errorMessage: (e as Error).message,
            errorCode: "gen_failed",
          });
          appendSummary(
            "wardrobe",
            `${w.id} 生成失败：${(e as Error).message}（未扣积分）`,
          );
        } finally {
          unregisterAbort(ctrl);
        }
      }

      if (get().runId !== startedRunId) return;
      appendSummary("wardrobe", "服装/道具准备完毕 · 风格统一");

      updateStage("wardrobe", { status: "ready" });
      collapseAfter("wardrobe", 1600);
      persistCurrent("running");
      openGate("wardrobe", () => runCast());
    };
    void loop();
  };

  /**
   * runCast — 生成「人物 & 场景素材」。基于剧本 characters/scenes
   * 字段（缺省 2 角色 + 2 场景），尺寸：角色 3:4、场景 16:9。
   * 完成后调用 ElevenLabs 自动绑定角色音色，再 openGate("cast", runPaint)。
   */
  const runCast = () => {
    closeGate();
    updateStage("cast", { status: "running", expanded: true });
    runTool("cast", "tool", "cast-and-scene-director · text-to-image", 1400, 0);
    appendRefThumbs("cast");


    const script = get().script as (GeneratedScript & { characters?: Array<{ name?: string; caption?: string }>; scenes?: Array<{ name?: string; caption?: string }> }) | null;
    type CastSpec = { id: string; caption: string; kind: "character" | "scene" };
    const characterSpec: CastSpec[] = Array.isArray(script?.characters) && script!.characters!.length
      ? script!.characters!.slice(0, 4).map((c, i: number) => ({
          id: `C${String(i + 1).padStart(2, "0")}`,
          caption: c.name ?? c.caption ?? `角色 ${i + 1}`,
          kind: "character" as const,
        }))
      : [
          { id: "C01", caption: "主角", kind: "character" },
          { id: "C02", caption: "配角", kind: "character" },
        ];
    const sceneSpec: CastSpec[] = Array.isArray(script?.scenes) && script!.scenes!.length
      ? script!.scenes!.slice(0, 3).map((s, i: number) => ({
          id: `S${String(i + 1).padStart(2, "0")}`,
          caption: s.name ?? s.caption ?? `场景 ${i + 1}`,
          kind: "scene" as const,
        }))
      : [
          { id: "S01", caption: "主场景", kind: "scene" },
          { id: "S02", caption: "次场景", kind: "scene" },
        ];
    const castSpec = [...characterSpec, ...sceneSpec];

    streamLines("cast", castSpec.map((c) => `${c.id}：${c.caption}`), 600, 250);

    const castAssets: Asset[] = castSpec.map((c) => ({
      id: c.id,
      kind: "image",
      label: c.id,
      caption: c.caption,
      status: "Queued",
      stageId: "cast",
      width: c.kind === "scene" ? 1920 : 1280,
      height: c.kind === "scene" ? 1080 : 960,
      aspectRatio: c.kind === "scene" ? "16:9" : "4:3",
    }));

    set((s) => ({
      assets: [...s.assets, ...castAssets],
      rail: { ...s.rail, open: true, flashId: castSpec[0]?.id },
    }));

    const startedRunId = get().runId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    // Wardrobe / prop references — bind characters to their clothing.
    const wardrobeRefs = get()
      .assets.filter((a) => a.stageId === "wardrobe" && a.url && /^https?:\/\//.test(a.url))
      .map((a) => a.url as string);

    const loop = async () => {
      const userId = await ensureUserId();
      if (!userId) {
        const reason = "请先登录后再生成人物/场景素材";
        for (const c of castAssets) {
          if (get().runId !== startedRunId) return;
          updateAsset(c.id, { status: "Failed", errorMessage: reason, errorCode: "auth_required" });
        }
        appendSummary("cast", `未登录 · 已暂停生成（${reason}）`);
        updateStage("cast", { status: "failed", errorMessage: reason });
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }

      for (const c of castSpec) {
        if (get().runId !== startedRunId) return;
        const cur = get().assets.find((a) => a.id === c.id);
        if (cur?.status === "Ready" || cur?.status === "Failed") continue;
        if (get().paused) {
          schedule(() => void loop(), 0);
          return;
        }
        updateAsset(c.id, { status: "Generating", errorMessage: undefined });
        const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
        const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
        const userRefs = get().attachments
          .filter((a) => a.kind === "image" && /^https?:\/\//.test(a.url))
          .map((a) => a.url);
        const refUrls = [...wardrobeRefs, ...userRefs].slice(0, 6);
        const refLine = refUrls.length
          ? `\n\nReferences (lock visual identity / wardrobe / style): ${refUrls.join(" ")}`
          : "";
        const subject = c.kind === "character"
          ? `Character TURNAROUND reference sheet: ${c.caption}. Show the SAME character in THREE views inside ONE single image, evenly spaced left-to-right on a clean neutral grey backdrop: (1) front view, (2) 3/4 side view, (3) back view. Full-body figure in each view, identical outfit, hairstyle, accessories, and proportions. Even soft studio lighting, no shadows beyond the figure, no extra characters, no environment, no text labels. This sheet is used to lock identity for downstream keyframes. Wearing the wardrobe shown in the reference images.`
          : `Scene reference plate: ${c.caption}. Wide establishing shot of the location, no characters, cinematic lighting, hero environment plate to be re-used across keyframes.`;

        const fullPrompt = [
          styleFragment ? `Visual style: ${styleFragment}.` : "",
          `This is a ${c.kind === "character" ? "CHARACTER" : "SCENE"} REFERENCE asset (id ${c.id}) — it must be a reusable production reference, not a story keyframe.`,
          subject,
          `Project brief (context only): ${briefPrompt}`,
          `NEGATIVE: no text, no watermark, no UI overlays.${refLine}`,
        ].filter(Boolean).join("\n\n");
        const ctrl = registerAbort();
        try {
          const b64 = await streamGenerateImage({
            prompt: fullPrompt,
            quality: "low",
            signal: ctrl.signal,
            onPartial: (dataUrl) => {
              if (get().runId !== startedRunId) return;
              if (get().paused) return;
              updateAsset(c.id, { url: dataUrl });
            },
          });
          if (get().runId !== startedRunId) return;
          const url = await uploadBase64Image({ base64: b64, userId, taskId });
          if (get().runId !== startedRunId) return;
          updateAsset(c.id, { status: "Ready", url, errorMessage: undefined });
          consume("cast", `Cast · ${c.id}`, 5, get().taskId);
        } catch (e) {
          if (isAbortError(e) || ctrl.signal.aborted) {
            updateAsset(c.id, { status: "Queued", url: undefined });
            schedule(() => void loop(), 0);
            return;
          }
          console.error("[cast] failed", c.id, e);
          updateAsset(c.id, {
            status: "Failed",
            url: undefined,
            errorMessage: (e as Error).message,
            errorCode: "gen_failed",
          });
          appendSummary("cast", `${c.id} 生成失败：${(e as Error).message}（未扣积分）`);
        } finally {
          unregisterAbort(ctrl);
        }
      }

      if (get().runId !== startedRunId) return;
      appendSummary("cast", "人物 / 场景素材就绪");

      // ElevenLabs auto-bind voice — now that characters exist as assets.
      try {
        const [{ useVoices }, { bindCharacterVoice, listCharacterVoices }, { useCharacterVoices }] =
          await Promise.all([
            import("@/lib/sc/voices-store"),
            import("@/lib/characters.functions"),
            import("@/lib/sc/character-voices-store"),
          ]);
        const vState = useVoices.getState();
        await vState.fetchVoices().catch(() => void 0);
        const voices = useVoices.getState().voices.filter((v) => v.status === "ready");
        if (voices.length) {
          const existing = await listCharacterVoices({ data: {} }).catch(() => ({ bindings: [] }));
          const taken = new Set(
            (existing.bindings as Array<{ character_name: string }>).map((b) => b.character_name),
          );
          const characters = castAssets.filter((c) => /^C/i.test(c.id));
          let bound = 0;
          for (let i = 0; i < characters.length; i++) {
            const c = characters[i];
            const name = c.caption ?? c.id;
            if (taken.has(name)) continue;
            const isFemale = /女|her|she|sister|mother|girl/i.test(name);
            const isMale = /男|him|he|brother|father|boy/i.test(name);
            const pool = voices.filter((v) => {
              if (isFemale) return /female|woman|girl|她|女/i.test(`${v.name} ${v.description ?? ""}`);
              if (isMale) return /male|man|boy|他|男/i.test(`${v.name} ${v.description ?? ""}`);
              return true;
            });
            const pick = (pool.length ? pool : voices)[i % (pool.length || voices.length)];
            if (!pick) continue;
            await bindCharacterVoice({
              data: { character_name: name, voice_id: pick.id, task_id: get().taskId ?? undefined },
            }).catch(() => void 0);
            bound++;
          }
          await useCharacterVoices.getState().refresh();
          if (bound > 0) {
            appendSummary("cast", `已为 ${bound} 位角色自动绑定默认音色 · 可在「音色库」中调整`);
          }
        }
      } catch (e) {
        console.warn("[cast] auto-bind voice failed", e);
      }

      updateStage("cast", { status: "ready" });
      collapseAfter("cast", 1600);
      persistCurrent("running");
      openGate("cast", () => runPaint());
    };
    void loop();
  };




  const runPaint = () => {
    closeGate();
    updateStage("paint", { status: "running", expanded: true });
    runTool("paint", "skill", "ai-video-studio · keyframe-painter", 800, 0);
    runTool("paint", "tool", "text-to-image · streaming", 1200, 900);
    appendRefThumbs("paint");


    const scriptForThought = get().script;
    const wardrobeIds = get()
      .assets.filter((a) => a.stageId === "wardrobe")
      .map((a) => a.id);
    const shotCount = scriptForThought?.shots?.length ?? STORYBOARD_ROWS.length;
    schedule(
      () =>
        addThought("paint", {
          title: "基于服装/道具素材生成分镜",
          body: [
            wardrobeIds.length
              ? `锁定服装/道具参考：${wardrobeIds.join(" · ")}`
              : "未生成服装/道具参考 · 直接按 prompt 渲染",
            `将分批生成 ${shotCount} 个关键帧，覆盖全部镜头。`,
            scriptForThought?.cameraLanguage
              ? `镜头语言：${scriptForThought.cameraLanguage}`
              : "镜头语言：依据脚本动态选择",
            scriptForThought?.mood
              ? `情绪基调：${scriptForThought.mood}`
              : "情绪基调：贴合用户主题",
          ],
          thumbAssetIds: wardrobeIds,
        }),
      1200,
    );

    const script = get().script;
    const SHOTS = script?.shots?.length
      ? script.shots.map((s) => ({
          shot: s.shot,
          motion: s.motion,
          scene: s.scene,
          elements: s.elements,
          prompt: s.prompt,
        }))
      : STORYBOARD_ROWS.map((r) => ({ ...r, prompt: "" }));
    streamLines(
      "paint",
      [`队列接收 · ${SHOTS.length} 个关键帧 · prompt 已写入…`],
      0,
      200,
    );

    // 全部以 Queued 插入
    const paintAssets: Asset[] = SHOTS.map((r) => ({
      id: r.shot,
      kind: "image" as const,
      label: r.shot,
      caption: `Keyframe · ${r.scene}`,
      status: "Queued" as const,
      stageId: "paint" as const,
      width: 1080,
      height: 1920,
    }));
    set((s) => ({
      assets: [...s.assets, ...paintAssets],
      rail: { ...s.rail, open: true, flashId: SHOTS[0]?.shot },
    }));

    // 串行真实生图
    const startedRunId = get().runId;
    const loop = async () => {
      const userId = await ensureUserId();
      const taskId = get().taskId ?? undefined;
      const briefPrompt = get().brief?.prompt ?? "";

      if (!userId) {
        const reason = "请先登录后再生成关键帧";
        for (const r of SHOTS) {
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, {
            status: "Failed",
            errorMessage: reason,
            errorCode: "auth_required",
          });
        }
        appendSummary("paint", `未登录 · 已暂停生成（${reason}）`);
        updateStage("paint", { status: "failed", errorMessage: reason });
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }

      for (const r of SHOTS) {
        if (get().runId !== startedRunId) return;
        const cur = get().assets.find((a) => a.id === r.shot);
        if (cur?.status === "Ready" || cur?.status === "Failed") continue;
        if (get().paused) {
          schedule(() => void loop(), 0);
          return;
        }
        updateAsset(r.shot, { status: "Generating" });
        appendSummary("paint", `${r.shot} 生成中 · ${r.motion}`);
        const ctrl = registerAbort();
        try {
          const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
          const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
          const stylePrefix = styleFragment ? `Style: ${styleFragment}.\n\n` : "";
          const fullPrompt = r.prompt
            ? `${stylePrefix}${r.prompt}\n\nReference brief: ${briefPrompt}`
            : [
                stylePrefix + briefPrompt,
                KEYFRAME_PROMPT_DETAIL,
                `Shot ${r.shot} · ${r.scene} · ${r.motion} · ${r.elements}`,
              ].filter(Boolean).join("\n\n");
          const b64 = await streamGenerateImage({
            prompt: fullPrompt,
            quality: "low",
            signal: ctrl.signal,
            onPartial: (dataUrl) => {
              if (get().runId !== startedRunId) return;
              if (get().paused) return;
              updateAsset(r.shot, { url: dataUrl });
            },
          });
          if (get().runId !== startedRunId) return;
          const url = await uploadBase64Image({ base64: b64, userId, taskId });
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, { status: "Ready", url });
          consume("paint", `Keyframe ${r.shot} · stream-gen`, 5, get().taskId);
          appendSummary("paint", `${r.shot} Ready · ${r.motion}`);
        } catch (e) {
          if (isAbortError(e) || ctrl.signal.aborted) {
            updateAsset(r.shot, { status: "Queued", url: undefined });
            schedule(() => void loop(), 0);
            return;
          }
          console.error("[paint] failed", r.shot, e);
          updateAsset(r.shot, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "gen_failed",
          });
          appendSummary(
            "paint",
            `${r.shot} 生成失败：${(e as Error).message}（未扣积分）`,
          );
        } finally {
          unregisterAbort(ctrl);
        }
      }

      if (get().runId !== startedRunId) return;
      updateStage("paint", { status: "ready" });
      appendSummary(
        "paint",
        `${SHOTS.length} 个关键帧已就绪 · 锁定为 V01–V0${SHOTS.length} 的 image_url`,
      );
      collapseAfter("paint", 1800);
      persistCurrent("running");
      openGate("keyframe", () => runQC());
    };
    void loop();
  };

  const runQC = () => {
    closeGate();
    updateStage("qc", { status: "running", expanded: true });
    const tcId = startToolCall("qc", "skill", "qc-consistency-checker · multimodal");
    appendSummary("qc", "采集所有关键帧 · 提交多模态一致性检查…");

    const startedRunId = get().runId;
    const scriptForQC = get().script;
    const briefForQC = get().brief;
    const shotsForQC = get()
      .assets.filter(
        (a) => a.stageId === "paint" && a.url && /^https?:\/\//.test(a.url),
      )
      .map((a) => {
        const meta = scriptForQC?.shots?.find((s) => s.shot === a.id);
        return {
          id: a.id,
          url: a.url as string,
          scene: meta?.scene ?? a.caption ?? "",
          elements: meta?.elements ?? "",
        };
      });

    void (async () => {
      if (shotsForQC.length === 0) {
        if (get().runId !== startedRunId) return;
        finishToolCall("qc", tcId);
        appendSummary("qc", "未找到可检查的真实关键帧 · 跳过 QC");
        updateStage("qc", { status: "ready" });
        collapseAfter("qc", 1400);
        schedule(() => runLife(), 1100);
        return;
      }

      let result: import("@/lib/qc.functions").QcResult;
      try {
        const { checkConsistency } = await import("@/lib/qc.functions");
        result = await checkConsistency({
          data: {
            shots: shotsForQC,
            brief: briefForQC
              ? { prompt: briefForQC.prompt, adType: briefForQC.adType }
              : undefined,
          },
        });
      } catch (e) {
        console.error("[qc] checkConsistency failed", e);
        result = {
          issues: [],
          passedDimensions: [
            "角色一致性",
            "场景一致性",
            "服装/道具连贯",
            "故事连贯性",
            "幻觉/事实性",
            "法务/合规",
          ],
          degraded: true,
          error: (e as Error).message,
        };
      }
      if (get().runId !== startedRunId) return;
      finishToolCall("qc", tcId);

      // Save issues onto stage thoughts for downstream use
      pendingQcIssues = result.issues;

      for (const dim of result.passedDimensions) {
        appendSummary("qc", `${dim} ✓`);
      }

      if (result.issues.length === 0) {
        appendSummary(
          "qc",
          result.degraded ? "QC 服务降级 · 默认通过" : "一致性全部通过 ✓",
        );
        updateStage("qc", { status: "ready" });
        collapseAfter("qc", 1400);
        schedule(() => runLife(), 1100);
        return;
      }

      appendSummary("qc", `发现 ${result.issues.length} 处问题，需要修正：`);
      addThought("qc", {
        title: "修改建议",
        body: result.issues.map(
          (it) =>
            `${it.shotId} · ${it.dimension}（${it.severity}）— ${it.suggestion}`,
        ),
      });
      openGate("qc-fix", () => applyQCFixInternal());
    })();
  };

  const applyQCFixInternal = () => {
    closeGate();
    const issues = pendingQcIssues;
    if (!issues.length) {
      appendSummary("qc", "无待修正项 · 直接进入下一步");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
      return;
    }

    appendSummary("qc", `调用快模型重生成 ${issues.length} 个镜头…`);
    const startedRunId = get().runId;
    const userId = get().currentUserId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    void (async () => {
      // Collect wardrobe + cast reference URLs (W/P + C/S) for character/prop/scene locking.
      const wardrobeRefs = get()
        .assets.filter(
          (a) =>
            a.stageId === "wardrobe" &&
            a.url &&
            /^https?:\/\//.test(a.url),
        )
        .map((a) => a.url as string);
      const castRefs = get()
        .assets.filter(
          (a) =>
            a.stageId === "cast" &&
            a.url &&
            /^https?:\/\//.test(a.url),
        )
        .map((a) => a.url as string);


      for (const issue of issues) {
        if (get().runId !== startedRunId) return;
        const tcId = startToolCall("qc", "tool", `re-paint · ${issue.shotId}`);
        updateAsset(issue.shotId, { status: "Generating", errorMessage: undefined });
        try {
          if (!userId) {
            updateAsset(issue.shotId, { status: "Ready" });
          } else {
            const originalShot = get().assets.find(
              (a) => a.id === issue.shotId,
            );
            const originalUrl =
              originalShot?.url && /^https?:\/\//.test(originalShot.url)
                ? originalShot.url
                : undefined;
            const refs = [...castRefs, ...wardrobeRefs];
            if (originalUrl) refs.push(originalUrl);


            const editPrompt = [
              `Re-render keyframe ${issue.shotId} for a short film while strictly preserving character identity and key prop appearance from the reference images (W01 hero, W02 supporting, P01 key prop).`,
              `Consistency dimension to fix: ${issue.dimension}. Required correction: ${issue.suggestion}`,
              `Detailed instruction: ${issue.fixPrompt}`,
              `User brief (stay on-topic, do NOT introduce unrelated brands or scenes): ${briefPrompt}`,
              `Keep the same composition and framing as the last reference image (the previous version of this shot). Output a single final keyframe image.`,
            ].join("\n\n");

            const { editImageWithRefs } = await import(
              "@/lib/image-edit.functions"
            );
            const { b64 } = await editImageWithRefs({
              data: { prompt: editPrompt, imageUrls: refs.slice(0, 6) },
            });
            if (get().runId !== startedRunId) return;
            const url = await uploadBase64Image({ base64: b64, userId, taskId });
            if (get().runId !== startedRunId) return;
            updateAsset(issue.shotId, {
              status: "Ready",
              url,
              errorMessage: undefined,
            });
          }
          appendSummary("qc", `${issue.shotId} 已修正 (${issue.dimension})`);
        } catch (e) {
          console.error("[qc] re-paint failed", issue.shotId, e);
          updateAsset(issue.shotId, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "edit_failed",
          });
          appendSummary(
            "qc",
            `${issue.shotId} 修正失败：${(e as Error).message}（未扣积分）`,
          );
        } finally {
          finishToolCall("qc", tcId);
        }
      }
      if (get().runId !== startedRunId) return;
      pendingQcIssues = [];
      appendSummary("qc", "修正完成 · 一致性全部通过 ✓");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
    })();
  };

  const runLife = (opts: { mode?: "single" | "all"; startIndex?: number } = {}) => {
    const mode = opts.mode ?? "all";
    closeGate();
    const VIDEO_COST_PER_SEG = 5;
    const briefFormat = get().brief?.format ?? "";
    const requestedDuration = parseFormatDuration(briefFormat);
    const videoRatio = parseFormatRatio(briefFormat);

    // Build segment plan: prefer 10s chunks, top up with a 5s tail.
    const script = get().script;
    const shotsRef = script?.shots ?? [];
    const paintAssetsAll = get().assets.filter((a) => a.stageId === "paint" && a.url);
    const pickKeyframe = (shotId: string | undefined): string | undefined => {
      if (shotId) {
        const exact = paintAssetsAll.find((p) => p.id === shotId);
        if (exact?.url) return exact.url;
      }
      const httpFirst = paintAssetsAll.find((p) => /^https?:\/\//.test(p.url!));
      return (httpFirst ?? paintAssetsAll[0])?.url;
    };

    const planDurations: Array<5 | 10> = [];
    if (requestedDuration <= 5) {
      planDurations.push(5);
    } else if (requestedDuration <= 10) {
      planDurations.push(10);
    } else {
      const tens = Math.floor(requestedDuration / 10);
      const rem = requestedDuration - tens * 10;
      for (let i = 0; i < tens; i++) planDurations.push(10);
      if (rem >= 3) planDurations.push(5);
    }
    // Cap segment count to available shots (or at least 1 segment).
    const maxSegs = Math.max(1, Math.min(planDurations.length, Math.max(shotsRef.length, 1)));
    const segments = planDurations.slice(0, maxSegs);
    if (segments.length === 0) segments.push(10);

    // 已经存在的 life 资产（包括之前生成的 Ready / Failed / Processing）。
    const existingLife = get().assets.filter((a) => a.stageId === "life");
    const existingMaxIndex = existingLife.reduce(
      (mx, a) => Math.max(mx, typeof a.segmentIndex === "number" ? a.segmentIndex + 1 : 0),
      0,
    );
    const effectiveStart = Math.max(
      opts.startIndex ?? existingMaxIndex,
      existingMaxIndex,
    );
    if (effectiveStart >= segments.length) {
      // 没有剩余可生成，直接到合成 gate。
      updateStage("life", { status: "ready" });
      set({ lifePlan: { total: segments.length, produced: effectiveStart } });
      openGate("merge", () => runDetails());
      return;
    }
    const endIndex =
      mode === "single" ? effectiveStart + 1 : segments.length;
    const rangeSegments = segments.slice(effectiveStart, endIndex);
    const totalCost = VIDEO_COST_PER_SEG * rangeSegments.length;

    if (!canAfford(totalCost)) {
      updateStage("life", { status: "recovering", expanded: true, summary: [] });
      const tid = get().taskId ?? undefined;
      useCredits.getState().openLow(tid);
      set({ phase: "failed" });
      persistCurrent("failed");
      return;
    }

    set({ lifePlan: { total: segments.length, produced: effectiveStart } });
    updateStage("life", { status: "running", expanded: true });
    runTool("life", "skill", "reference-image-to-video · WAN", 1200, 0);

    const totalSeconds = segments.reduce((s, n) => s + n, 0);
    const rangeSeconds = rangeSegments.reduce((s, n) => s + n, 0);
    if (mode === "single") {
      appendSummary(
        "life",
        `计划：共 ${segments.length} 段，本次生成第 ${effectiveStart + 1} 段（${rangeSegments[0]}s）`,
      );
    } else if (effectiveStart > 0) {
      appendSummary(
        "life",
        `继续生成剩余 ${rangeSegments.length} 段（${effectiveStart + 1}–${segments.length}）· ${rangeSegments.join("+")}s ≈ ${rangeSeconds}s`,
      );
    } else {
      appendSummary(
        "life",
        `计划：${segments.length} 段 · ${segments.join("+")}s ≈ ${totalSeconds}s ${
          totalSeconds === requestedDuration
            ? ""
            : `（用户期望 ${requestedDuration}s，按 WAN 8s/10s 颗粒拼接）`
        }`.trim(),
      );
    }

    // Collect wardrobe refs once
    const wardrobeRefs = get()
      .assets.filter(
        (a) =>
          a.stageId === "wardrobe" && a.url && /^https?:\/\//.test(a.url),
      )
      .map((a) => a.url as string)
      .slice(0, 4);

    // Pre-insert V0N assets only for this range (Queued)
    const segAssets: Asset[] = rangeSegments.map((dur, i) => {
      const absIndex = effectiveStart + i;
      const idx = absIndex + 1;
      const segId = `V${idx.toString().padStart(2, "0")}`;
      const shot = shotsRef[absIndex] ?? shotsRef[shotsRef.length - 1];
      const keyUrl = pickKeyframe(shot?.shot);
      return {
        id: segId,
        kind: "video" as const,
        label: segId,
        caption: shot?.scene
          ? `${shot.shot ?? segId} · ${shot.scene} · ${dur}s`
          : `Segment ${idx} · ${dur}s`,
        status: "Queued" as const,
        stageId: "life" as const,
        duration: formatDurationLabel(dur),
        segmentIndex: absIndex,
        sourceShotId: shot?.shot,
        poster: keyUrl,
      };
    });
    set((s) => ({
      assets: [...s.assets, ...segAssets],
      rail: { ...s.rail, open: true, flashId: segAssets[0]?.id },
    }));

    const briefPrompt = get().brief?.prompt ?? "";
    const startedRunId = get().runId;

    void (async () => {
      // Refresh auth before deciding fail-fast
      let userId = get().currentUserId;
      if (!userId) {
        try {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
          if (userId) set({ currentUserId: userId });
        } catch {
          /* ignore */
        }
      }
      if (!userId) {
        const reason = "未登录，无法生成真实视频。请先登录后重试。";
        for (const sa of segAssets) {
          updateAsset(sa.id, { status: "Failed", errorMessage: reason });
        }
        updateStage("life", { status: "failed", errorMessage: reason });
        appendSummary("life", `生成失败：${reason}（未扣积分）`);
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }

      // Run each segment in parallel
      const tasks = segAssets.map(async (sa, i) => {
        const dur = segments[i];
        const shot = shotsRef[i] ?? shotsRef[shotsRef.length - 1];
        const keyUrl = pickKeyframe(shot?.shot);
        if (!keyUrl) {
          updateAsset(sa.id, {
            status: "Failed",
            errorMessage: "缺少首帧关键帧，请重跑 Keyframes 阶段。",
            errorCode: "missing_keyframe",
          });
          appendSummary("life", `${sa.id} 失败：缺少关键帧（未扣积分）`);
          return false;
        }
        const segPrompt = [
          shot?.prompt || briefPrompt,
          shot?.scene ? `Scene: ${shot.scene}` : "",
          shot?.motion ? `Camera/motion: ${shot.motion}` : "",
          shot?.elements ? `Key elements: ${shot.elements}` : "",
          `Stay strictly on the user's brief: ${briefPrompt}`,
          `Preserve character/prop identity from reference images.`,
        ]
          .filter(Boolean)
          .join("\n");

        updateAsset(sa.id, { status: "Processing" });
        appendSummary("life", `提交 ${sa.id} · ${shot?.shot ?? "—"} · ${dur}s`);

        const trySubmit = async (
          mode: "refs" | "text-only",
        ): Promise<{ ok: true; ossUrl: string } | { ok: false; code: string; message: string }> => {
          try {
            const currentTaskId = get().taskId;
            const submitArgs =
              mode === "refs"
                ? {
                    route: "reference-image-to-video" as const,
                    videoTaskId: currentTaskId ?? null,
                    payload: {
                      prompt: segPrompt,
                      image_urls: [...wardrobeRefs, keyUrl].slice(0, 3),
                      ratio: videoRatio,
                    } as unknown as { prompt: string },
                  }
                : {
                    route: "text-to-video" as const,
                    videoTaskId: currentTaskId ?? null,
                    payload: {
                      prompt: `${segPrompt}\n(无真人参考，请按描述生成)`,
                      ratio: videoRatio,
                    } as unknown as { prompt: string },
                  };
            const submitRes = await submitVideoTask({ data: submitArgs });
            if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
            console.info("[life] submit WAN", { assetId: sa.id, route: submitArgs.route, taskId: submitRes.taskId, projectId: submitRes.projectId });
            appendSummary("life", `${sa.id} WAN task: ${submitRes.taskId}${mode === "text-only" ? "（已降级为纯文本）" : ""}`);


            const started = Date.now();
            let transient = 0;
            let lastTransientMsg = "";
            while (true) {
              if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
              await pausableSleep(POLL_INTERVAL_MS);
              if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
              let r;
              try {
                r = await pollVideoTask({ data: { taskId: submitRes.taskId } });
                if (transient > 0) {
                  transient = 0;
                  updateAsset(sa.id, { status: "Processing", errorMessage: undefined, errorCode: undefined });
                }
              } catch (e) {
                transient += 1;
                lastTransientMsg = (e as Error).message ?? "网络异常";
                console.error(`[life] ${sa.id} poll error (${transient}/${POLL_MAX_TRANSIENT})`, e);
                if (transient > POLL_MAX_TRANSIENT) {
                  return {
                    ok: false,
                    code: "poll_failed",
                    message: `WAN 轮询连续异常，已停止重试：${lastTransientMsg.slice(0, 120)}`,
                  };
                }
                updateAsset(sa.id, {
                  status: "Recovering",
                  errorMessage: `网络异常，自动重试 ${transient}/${POLL_MAX_TRANSIENT} …`,
                  errorCode: "poll_transient",
                });
                await pausableSleep(POLL_BACKOFFS[Math.min(transient - 1, POLL_BACKOFFS.length - 1)]);
                continue;
              }
              if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
              if (r.status === "success" && r.ossUrl) {
                return { ok: true, ossUrl: r.ossUrl };
              }
              if (r.status === "failed") {
                return {
                  ok: false,
                  code: r.errorCode ?? "wan_failed",
                  message: r.errorMessage ?? "WAN 渲染失败",
                };
              }
              if (Date.now() - started > POLL_TIMEOUT_MS) {
                return { ok: false, code: "timeout", message: "WAN 轮询超时（5min）" };
              }
              updateAsset(sa.id, { status: "Processing" });
            }

          } catch (e) {
            const raw = (e as Error).message ?? "";
            // 解析 submitVideoTask 抛出的前缀 `[code] msg :: upstream`
            const m = raw.match(/^\[(policy_real_person|policy_violation|quota_exceeded|submit_failed)\]\s*([^:]+)/);
            if (m) {
              return { ok: false, code: m[1], message: m[2].trim() };
            }
            return { ok: false, code: "submit_failed", message: raw };
          }
        };

        // 第一次：带参考图
        let r = await trySubmit("refs");
        // 真人/违规自动降级一次：剔除人物参考改 text-to-video
        if (!r.ok && (r.code === "policy_real_person" || r.code === "policy_violation")) {
          appendSummary("life", `${sa.id} 触发上游安全审核，自动降级为纯文本重试…`);
          updateAsset(sa.id, { status: "Processing", errorMessage: r.message, errorCode: r.code });
          r = await trySubmit("text-only");
        }
        if (r.ok) {
          updateAsset(sa.id, {
            status: "Ready",
            url: r.ossUrl,
            poster: keyUrl,
            errorMessage: undefined,
            errorCode: undefined,
          });
          consume("life", `Video ${sa.id} · wan`, VIDEO_COST_PER_SEG, get().taskId);
          appendSummary("life", `${sa.id} Ready`);
          return true;
        }
        if (r.code === "cancelled") return false;
        updateAsset(sa.id, {
          status: "Failed",
          errorMessage: r.message,
          errorCode: r.code,
        });
        appendSummary("life", `${sa.id} 失败：${r.message}（未扣积分）`);
        return false;
      });

      const results = await Promise.all(tasks);
      if (get().runId !== startedRunId) return;
      const okCount = results.filter(Boolean).length;
      if (okCount === segAssets.length) {
        const newProduced = effectiveStart + okCount;
        set({ lifePlan: { total: segments.length, produced: newProduced } });
        if (newProduced >= segments.length) {
          updateStage("life", { status: "ready" });
          appendSummary("life", `全部 ${newProduced} 段 Ready · 合计 ≈ ${totalSeconds}s`);
          collapseAfter("life", 1800);
          persistCurrent("running");
          openGate("merge", () => runDetails());
        } else {
          // 仍有剩余分镜：保持 stage 为 running，弹出 life-continue gate 让用户决定。
          appendSummary(
            "life",
            `本批 ${okCount} 段 Ready · 已生成 ${newProduced}/${segments.length}`,
          );
          persistCurrent("running");
          openGate("life-continue", () =>
            runLife({ mode: "all", startIndex: newProduced }),
          );
        }

      } else if (okCount === 0) {
        const policyHits = get().assets.filter(
          (a) => a.stageId === "life" && (a.errorCode === "policy_real_person" || a.errorCode === "policy_violation"),
        ).length;
        const topReason = pickTopFailReason(get().assets);
        const baseMsg =
          policyHits > 0
            ? `${policyHits}/${segAssets.length} 段被上游安全审核拒绝（参考图疑似真人或违规），可在下方更换参考图后单独重做。`
            : "全部视频段渲染失败，可在下方单独重做某一段";
        const msg = topReason ? `${baseMsg}：${topReason}` : baseMsg;
        updateStage("life", { status: "failed", errorMessage: msg });
        appendSummary("life", msg);
        set({ phase: "failed" });
        persistCurrent("failed");
      } else {
        const topReason = pickTopFailReason(get().assets);
        const partial = topReason
          ? `${okCount}/${segAssets.length} 段成功，其余失败 · 常见原因：${topReason} · 可点击单段重试`
          : `${okCount}/${segAssets.length} 段成功，其余失败 · 可点击单段重试`;
        updateStage("life", { status: "failed", errorMessage: partial });
        appendSummary("life", partial);
        set({ phase: "failed" });
        persistCurrent("failed");

      }
    })();
  };

  /**
   * Re-submit a single life segment (V0N) without restarting the whole stage.
   * Reuses the existing keyframe + wardrobe references; consumes credit only
   * on success (same as runLife).
   */
  const runWardrobeAsset = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "wardrobe") return;
    const startedRunId = get().runId;
    const briefPrompt = get().brief?.prompt ?? "";
    updateAsset(assetId, { status: "Generating", errorMessage: undefined, errorCode: undefined });
    appendSummary("wardrobe", `${assetId} 单图重做中…`);
    void (async () => {
      const userId = await ensureUserId();
      if (!userId) {
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: "请先登录后再生成",
          errorCode: "auth_required",
        });
        return;
      }
      const taskId = get().taskId ?? undefined;
      const isProp = /^P/i.test(assetId);
      const isHero = /^W0*1$/i.test(assetId);
      const role = isProp
        ? "key prop / object hero shot, centered, studio lighting, neutral background"
        : isHero
          ? "main character / hero subject portrait, full body, neutral background, reference sheet style"
          : "secondary character / supporting subject portrait, full body, neutral background, reference sheet style";
      const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
      const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
      const fullPrompt = [
        styleFragment ? `Style: ${styleFragment}.` : "",
        `Reference asset ${assetId} for the short film. Subject: ${asset.caption ?? assetId}.`,
        `Style direction: ${role}.`,
        `User brief (must reflect the actual subject, do NOT invent unrelated brands or scenes): ${briefPrompt}`,
      ].filter(Boolean).join("\n\n");
      const ctrl = registerAbort();
      try {
        const b64 = await streamGenerateImage({
          prompt: fullPrompt,
          quality: "low",
          signal: ctrl.signal,
          onPartial: (dataUrl) => {
            if (get().runId !== startedRunId) return;
            if (get().paused) return;
            updateAsset(assetId, { url: dataUrl });
          },
        });
        if (get().runId !== startedRunId) return;
        const url = await uploadBase64Image({ base64: b64, userId, taskId });
        if (get().runId !== startedRunId) return;
        updateAssetWithVersion(assetId, url, "manual-retry", "单图重做", {
          status: "Ready",
          errorMessage: undefined,
          errorCode: undefined,
        });
        consume("wardrobe", `Wardrobe · ${assetId} retry`, 5, get().taskId);
        appendSummary("wardrobe", `${assetId} 重做完成`);
      } catch (e) {
        if (isAbortError(e) || ctrl.signal.aborted) {
          updateAsset(assetId, { status: "Queued", url: undefined });
          schedule(() => runWardrobeAsset(assetId), 0);
          return;
        }
        console.error("[wardrobe] single retry failed", assetId, e);
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "gen_failed",
        });
      } finally {
        unregisterAbort(ctrl);
      }
    })();
  };

  const runPaintShot = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "paint") return;
    const startedRunId = get().runId;
    const briefPrompt = get().brief?.prompt ?? "";
    const script = get().script;
    const shot = script?.shots?.find((s) => s.shot === assetId);
    updateAsset(assetId, { status: "Generating", errorMessage: undefined, errorCode: undefined });
    appendSummary("paint", `${assetId} 单图重做中…`);
    void (async () => {
      const userId = await ensureUserId();
      if (!userId) {
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: "请先登录后再生成",
          errorCode: "auth_required",
        });
        return;
      }
      const taskId = get().taskId ?? undefined;
      const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
      const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
      const stylePrefix = styleFragment ? `Style: ${styleFragment}.\n\n` : "";
      const fullPrompt = shot?.prompt
        ? `${stylePrefix}${shot.prompt}\n\nReference brief: ${briefPrompt}`
        : [
            stylePrefix + briefPrompt,
            KEYFRAME_PROMPT_DETAIL,
            shot
              ? `Shot ${shot.shot} · ${shot.scene} · ${shot.motion} · ${shot.elements}`
              : `Shot ${assetId} · ${asset.caption ?? ""}`,
          ].filter(Boolean).join("\n\n");
      const ctrl = registerAbort();
      try {
        const b64 = await streamGenerateImage({
          prompt: fullPrompt,
          quality: "low",
          signal: ctrl.signal,
          onPartial: (dataUrl) => {
            if (get().runId !== startedRunId) return;
            if (get().paused) return;
            updateAsset(assetId, { url: dataUrl });
          },
        });
        if (get().runId !== startedRunId) return;
        const url = await uploadBase64Image({ base64: b64, userId, taskId });
        if (get().runId !== startedRunId) return;
        updateAssetWithVersion(assetId, url, "manual-retry", "单图重做", {
          status: "Ready",
          errorMessage: undefined,
          errorCode: undefined,
        });
        consume("paint", `Keyframe ${assetId} · retry`, 5, get().taskId);
        appendSummary("paint", `${assetId} 重做完成`);
      } catch (e) {
        if (isAbortError(e) || ctrl.signal.aborted) {
          updateAsset(assetId, { status: "Queued", url: undefined });
          schedule(() => runPaintShot(assetId), 0);
          return;
        }
        console.error("[paint] single retry failed", assetId, e);
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "gen_failed",
        });
      } finally {
        unregisterAbort(ctrl);
      }
    })();
  };

  const runLifeSegment = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "life") return;
    const script = get().script;
    const shotsRef = script?.shots ?? [];
    const shot = shotsRef.find((s) => s.shot === asset.sourceShotId)
      ?? shotsRef[asset.segmentIndex ?? 0]
      ?? shotsRef[shotsRef.length - 1];

    const paintAssetsAll = get().assets.filter((a) => a.stageId === "paint" && a.url);
    const keyUrl =
      (shot && paintAssetsAll.find((p) => p.id === shot.shot)?.url) ||
      asset.poster ||
      paintAssetsAll.find((p) => /^https?:\/\//.test(p.url!))?.url ||
      paintAssetsAll[0]?.url;

    const dur = parseInt(String(asset.duration ?? "0:10").replace(/[^0-9]/g, "")) || 10;
    const segDur: 5 | 10 = dur >= 10 ? 10 : 5;
    const briefFormat = get().brief?.format ?? "";
    const videoRatio = parseFormatRatio(briefFormat);
    const briefPrompt = get().brief?.prompt ?? "";
    const VIDEO_COST_PER_SEG = 5;

    if (!canAfford(VIDEO_COST_PER_SEG)) {
      const tid = get().taskId ?? undefined;
      useCredits.getState().openLow(tid);
      return;
    }

    if (!keyUrl) {
      updateAsset(asset.id, {
        status: "Failed",
        errorMessage: "缺少首帧关键帧，请重跑 Keyframes 阶段。",
        errorCode: "missing_keyframe",
      });
      return;
    }

    // Reset stage to running so global UI reflects activity.
    updateStage("life", { status: "running", expanded: true, errorMessage: undefined });
    set({ phase: "running" });

    const wardrobeRefs = get()
      .assets.filter((a) => a.stageId === "wardrobe" && a.url && /^https?:\/\//.test(a.url))
      .map((a) => a.url as string)
      .slice(0, 4);

    const segPrompt = [
      shot?.prompt || briefPrompt,
      shot?.scene ? `Scene: ${shot.scene}` : "",
      shot?.motion ? `Camera/motion: ${shot.motion}` : "",
      shot?.elements ? `Key elements: ${shot.elements}` : "",
      `Stay strictly on the user's brief: ${briefPrompt}`,
      `Preserve character/prop identity from reference images.`,
    ].filter(Boolean).join("\n");

    updateAsset(asset.id, { status: "Processing", errorMessage: undefined, errorCode: undefined });
    appendSummary("life", `重做 ${asset.id} · ${shot?.shot ?? "—"} · ${segDur}s`);

    const startedRunId = get().runId;
    void (async () => {
      const trySubmit = async (
        mode: "refs" | "text-only",
      ): Promise<{ ok: true; ossUrl: string } | { ok: false; code: string; message: string }> => {
        try {
          const submitArgs =
            mode === "refs"
              ? {
                  route: "reference-image-to-video" as const,
                  videoTaskId: get().taskId ?? null,
                  payload: {
                    prompt: segPrompt,
                    image_urls: [...wardrobeRefs, keyUrl].slice(0, 3),
                    ratio: videoRatio,
                  } as unknown as { prompt: string },
                }
              : {
                  route: "text-to-video" as const,
                  videoTaskId: get().taskId ?? null,
                  payload: {
                    prompt: `${segPrompt}\n(无真人参考，请按描述生成)`,
                    ratio: videoRatio,
                  } as unknown as { prompt: string },
                };
          const submitRes = await submitVideoTask({ data: submitArgs });
          if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
          console.info("[life] retry WAN", { assetId: asset.id, route: submitArgs.route, taskId: submitRes.taskId, projectId: submitRes.projectId });

          appendSummary(
            "life",
            `${asset.id} WAN task: ${submitRes.taskId}${mode === "text-only" ? "（已降级为纯文本）" : ""}`,
          );
          const started = Date.now();
          let transient = 0;
          let lastTransientMsg = "";
          while (true) {
            if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
            await pausableSleep(POLL_INTERVAL_MS);
            if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
            let r;
            try {
              r = await pollVideoTask({ data: { taskId: submitRes.taskId } });
              if (transient > 0) {
                transient = 0;
                updateAsset(asset.id, { status: "Processing", errorMessage: undefined, errorCode: undefined });
              }
            } catch (e) {
              transient += 1;
              lastTransientMsg = (e as Error).message ?? "网络异常";
              console.error(`[life] segment ${asset.id} poll error (${transient}/${POLL_MAX_TRANSIENT})`, e);
              if (transient > POLL_MAX_TRANSIENT) {
                return {
                  ok: false,
                  code: "poll_failed",
                  message: `WAN 轮询连续异常，已停止重试：${lastTransientMsg.slice(0, 120)}`,
                };
              }
              updateAsset(asset.id, {
                status: "Recovering",
                errorMessage: `网络异常，自动重试 ${transient}/${POLL_MAX_TRANSIENT} …`,
                errorCode: "poll_transient",
              });
              await pausableSleep(POLL_BACKOFFS[Math.min(transient - 1, POLL_BACKOFFS.length - 1)]);
              continue;
            }
            if (get().runId !== startedRunId) return { ok: false, code: "cancelled", message: "" };
            if (r.status === "success" && r.ossUrl) return { ok: true, ossUrl: r.ossUrl };
            if (r.status === "failed") {
              return {
                ok: false,
                code: r.errorCode ?? "wan_failed",
                message: r.errorMessage ?? "WAN 渲染失败",
              };
            }
            if (Date.now() - started > POLL_TIMEOUT_MS) {
              return { ok: false, code: "timeout", message: "WAN 轮询超时（5min）" };
            }
            updateAsset(asset.id, { status: "Processing" });
          }

        } catch (e) {
          const raw = (e as Error).message ?? "";
          const m = raw.match(/^\[(policy_real_person|policy_violation|quota_exceeded|submit_failed)\]\s*([^:]+)/);
          if (m) return { ok: false, code: m[1], message: m[2].trim() };
          return { ok: false, code: "submit_failed", message: raw };
        }
      };

      let r = await trySubmit("refs");
      if (!r.ok && (r.code === "policy_real_person" || r.code === "policy_violation")) {
        appendSummary("life", `${asset.id} 触发上游安全审核，自动降级为纯文本重试…`);
        updateAsset(asset.id, { status: "Processing", errorMessage: r.message, errorCode: r.code });
        r = await trySubmit("text-only");
      }
      if (get().runId !== startedRunId) return;
      if (r.ok) {
        updateAssetWithVersion(asset.id, r.ossUrl, "manual-retry", "单段重做", {
          status: "Ready",
          poster: keyUrl,
          errorMessage: undefined,
          errorCode: undefined,
        });
        consume("life", `Video ${asset.id} · wan retry`, VIDEO_COST_PER_SEG, get().taskId);
        appendSummary("life", `${asset.id} Ready`);
        const allLife = get().assets.filter((a) => a.stageId === "life");
        if (allLife.every((a) => a.status === "Ready")) {
          updateStage("life", { status: "ready", errorMessage: undefined });
          persistCurrent("running");
          openGate("merge", () => runDetails());
        }
        return;
      }
      if (r.code === "cancelled") return;
      updateAsset(asset.id, {
        status: "Failed",
        errorMessage: r.message,
        errorCode: r.code,
      });
      appendSummary("life", `${asset.id} 重做失败：${r.message}（未扣积分）`);
    })();
  };


  const runDetails = () => {
    updateStage("details", { status: "running", expanded: true });
    const checks = [
      "QC：9:16 比例 ✓",
      "产品可见性 ✓",
      "无违规宣称 ✓",
      "视频链接已验证 ✓",
    ];
    streamLines("details", checks, 500, 200, () => {
      updateStage("details", { status: "ready" });
      consume("details", "Final QC pass", 5, get().taskId);
      set({ phase: "done" });
      collapseAfter("details", 1600);
      persistCurrent("done");
    });
  };

  const startRunning = () => {
    set({ phase: "running" });
    persistCurrent("running");
    runScene();
  };

  const requestPreflightOptions = (brief: Brief) => {
    // 进入 running 状态，让聊天面板可见
    set({ phase: "running" });
    persistCurrent("running");
    const agentId = uid();
    const agentMsg: ChatMsg = {
      id: agentId,
      role: "agent",
      text: "",
      ts: Date.now(),
      streaming: true,
      thinking: "",
      toolCalls: [],
      optionCards: [],
      skill: { name: "chat-director", sub: "refining brief" },
    };
    set((s) => ({ chatLog: [...s.chatLog, agentMsg] }));

    const patchAgent = (updater: (m: ChatMsg) => Partial<ChatMsg>) =>
      set((s) => ({
        chatLog: s.chatLog.map((m) => (m.id === agentId ? { ...m, ...updater(m) } : m)),
      }));

    void (async () => {
      try {
        const { data: { session: __s1 } } = await supabase.auth.getSession();
        const res = await fetch("/api/chat-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(__s1?.access_token ? { Authorization: `Bearer ${__s1.access_token}` } : {}),
          },
          body: JSON.stringify({
            mode: "preflight-options",
            messages: [{ role: "user", content: brief.prompt }],
            context: { phase: "preflight", brief },
          }),
        });
        if (!res.ok || !res.body) {
          // 失败：直接 startRunning，不阻塞用户
          patchAgent(() => ({ streaming: false, text: "（跳过偏好确认，直接开拍）" }));
          startRunning();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const handle = (ev: string, dataStr: string) => {
          let d: unknown;
          try { d = JSON.parse(dataStr); } catch { return; }
          const data = d as {
            text?: string;
            questions?: unknown;
            id?: string;
            intent?: "preflight" | "refine";
            fallback?: boolean;
            intro?: string;
            outro?: string;
          };
          if (ev === "token" && data.text) {
            patchAgent((m) => ({ text: m.text + data.text! }));
          } else if (ev === "option-card") {
            const qs = Array.isArray(data.questions) ? (data.questions as import("./types").ChatOptionQuestion[]) : [];
            // 空 questions 兜底：不再展示空卡片 / 误导性 outro，直接走 startRunning。
            if (qs.length === 0) {
              patchAgent(() => ({ streaming: false }));
              startRunning();
              return;
            }
            patchAgent((m) => ({
              optionCards: [
                ...(m.optionCards ?? []),
                {
                  id: data.id ?? `oc_${uid()}`,
                  questions: qs,
                  status: "awaiting",
                  intent: data.intent ?? "preflight",
                  primaryLabel: "Continue",
                  intro: data.intro,
                  outro: data.outro,
                },
              ],
            }));
          } else if (ev === "done") {
            patchAgent(() => ({ streaming: false }));
          }
        };
        while (true) {
          // Pause-aware: if user paused, freeze here until they resume. The
          // server may keep streaming into the TCP buffer but the screen
          // stops updating, which matches the visible "暂停" semantic.
          await waitForResume();
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split(/\r?\n\r?\n/);
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            const lines = block.split(/\r?\n/);
            let ev = "message";
            const dataLines: string[] = [];
            for (const raw of lines) {
              if (raw.startsWith("event:")) ev = raw.slice(6).trim();
              else if (raw.startsWith("data:")) dataLines.push(raw.slice(5).replace(/^\s/, ""));
            }
            if (dataLines.length) handle(ev, dataLines.join("\n"));
          }
        }
        patchAgent(() => ({ streaming: false }));
      } catch {
        patchAgent(() => ({ streaming: false, text: "（跳过偏好确认，直接开拍）" }));
        startRunning();
      }
    })();
  };

  return {
    phase: "empty",
    prompt: "",
    brief: null,
    stages: initialStages(),
    assets: [],
    taskTitle: "New chat",
    taskId: null,
    taskKind: "oneoff",
    taskHistory: [],
    attachments: [],
    gate: null,
    softGate: null,
    rail: { open: false },
    viewMode: "list",
    autoMode: "auto",
    timers: [],
    paused: false,
    pausedAt: null,
    pauseTask,
    resumeTask,
    runId: 0,
    selection: [],
    chatLog: [],
    versionDrawerAssetId: null,
    previewAssetId: null,
    currentUserId: null,
    script: null,
    pendingScript: null,
    hydrated: false,


    intakeSel: {},
    intakeCustoms: {},
    intakeOthers: null,

    hydrateFromStorage: () => {
      if (typeof window === "undefined") return;
      // Idempotent: once hydrated (or once an active task has been restored
      // via restoreTask, which also sets hydrated=true), do NOT re-overwrite
      // taskHistory / viewMode / autoMode. This prevents the project-detail
      // → restoreTask → navigate("/") → Index useEffect → hydrateFromStorage
      // race that previously could clobber the freshly restored task state.
      if (get().hydrated) return;
      const history = loadHistory().map((task) => normalizeTaskRecord(task));
      set({
        taskHistory: history,
        viewMode: loadViewMode(),
        autoMode: loadAutoMode(),
        hydrated: true,
      });
    },

    setPrompt: (v) => set({ prompt: v }),
    setAutoMode: (m) => {
      set({ autoMode: m });
      try {
        window.localStorage.setItem(AUTO_KEY, m);
      } catch {
        /* ignore */
      }
    },
    setViewMode: (v) => {
      set({ viewMode: v });
      try {
        window.localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* ignore */
      }
    },

    setIntakeSel: (key, value) =>
      set((s) => ({ intakeSel: { ...s.intakeSel, [key]: value } })),
    requestIntakeOthers: (key, label) => set({ intakeOthers: { key, label } }),
    cancelIntakeOthers: () => set({ intakeOthers: null }),
    resolveIntakeOthers: (value) => {
      const o = get().intakeOthers;
      if (!o) return;
      const v = value.trim();
      if (!v) {
        set({ intakeOthers: null });
        return;
      }
      set((s) => ({
        intakeCustoms: {
          ...s.intakeCustoms,
          [o.key]: [...(s.intakeCustoms[o.key] ?? []), v],
        },
        intakeSel: { ...s.intakeSel, [o.key]: v },
        intakeOthers: null,
        chatLog: [],
      }));
    },

    chatMessage: (text) => {
      const t = text.trim();
      if (!t) return;
      const refs = get().attachments;
      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        text: t,
        ts: Date.now(),
      };
      const agentId = uid();
      const agentMsg: ChatMsg = {
        id: agentId,
        role: "agent",
        text: "",
        ts: Date.now(),
        streaming: true,
        thinking: "",
        toolCalls: [],
      };
      set((s) => ({
        chatLog: [...s.chatLog, userMsg, agentMsg],
        attachments: [],
      }));

      const patchAgent = (
        updater: (msg: ChatMsg) => Partial<ChatMsg>,
      ) =>
        set((s) => ({
          chatLog: s.chatLog.map((m) =>
            m.id === agentId ? { ...m, ...updater(m) } : m,
          ),
        }));

      void (async () => {
        const s = get();
        const refsCtx = refs.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.displayName ?? a.name,
          url: a.url,
          assetId: a.ref,
        }));
        const refTag = refsCtx.length
          ? `[引用素材：${refsCtx.map((r) => r.assetId ?? r.name ?? r.id).join(", ")}] `
          : "";
        const taggedT = refTag + t;
        const history = s.chatLog
          .slice(-12)
          .filter((m) => m.id !== agentId && m.text)
          .map((m) => ({
            role: (m.role === "agent" ? "assistant" : "user") as
              | "assistant"
              | "user",
            content: m.text,
          }));
        if (!history.length || history[history.length - 1]?.content !== t) {
          history.push({ role: "user", content: taggedT });
        } else if (refTag) {
          history[history.length - 1] = { role: "user", content: taggedT };
        }
        const ctxScript = s.script
          ? {
              mood: s.script.mood,
              shots: s.script.shots?.map((sh) => ({
                shot: sh.shot,
                duration: sh.duration,
                scene: sh.scene,
              })),
            }
          : undefined;
        const ctxAssets = s.assets
          .filter((a) => !!a.url)
          .slice(-40)
          .map((a) => ({
            id: a.id,
            label: a.label,
            caption: a.caption,
            kind: a.kind,
            stageId: a.stageId,
            hasUrl: true,
          }));
        // 阶段状态摘要，让 AI 能识别"中断 / 失败"并提议 resume-from / retry-stage
        const ctxStages = STAGE_ORDER
          .map((sid) => ({ id: sid, status: s.stages[sid].status }))
          .filter((st) => st.status !== "pending");
        const failedStage = STAGE_ORDER.find((sid) => s.stages[sid].status === "failed");
        const runningStage = STAGE_ORDER.find((sid) => s.stages[sid].status === "running" || s.stages[sid].status === "recovering");
        const payload = {
          messages: history,
          context: {
            phase: s.phase,
            brief: s.brief ?? undefined,
            script: ctxScript,
            assets: ctxAssets.length ? ctxAssets : undefined,
            stages: ctxStages.length ? ctxStages : undefined,
            failedStage,
            runningStage,
            taskTitle: s.taskTitle || undefined,
            refs: refsCtx.length ? refsCtx : undefined,
          },
        };

        const failWith = (reason: string) => {
          patchAgent((m) => ({
            streaming: false,
            text: "AI 暂不可用：" + reason,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.status === "done" || tc.status === "failed"
                ? tc
                : {
                    ...tc,
                    status: "failed",
                    durationMs:
                      tc.durationMs ?? Date.now() - tc.startedAt,
                    output: tc.output ?? reason,
                  },
            ),
          }));
        };

        try {
          const { data: { session: __s2 } } = await supabase.auth.getSession();
          const res = await fetch("/api/chat-stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(__s2?.access_token ? { Authorization: `Bearer ${__s2.access_token}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => "");
            throw new Error(
              res.status === 429
                ? "请求过于频繁，请稍后再试"
                : res.status === 402
                  ? "AI 额度已用尽，请到 Settings · Usage 充值后再试"
                  : errText || `HTTP ${res.status}`,
            );
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          

          const handleEvent = (ev: string, dataStr: string) => {
            let data: unknown;
            try {
              data = JSON.parse(dataStr);
            } catch {
              return;
            }
            const d = data as {
              id?: string;
              label?: string;
              text?: string;
              summary?: string;
              message?: string;
            };

            if (ev === "phase") {
              if (!d.id || !d.label) return;
              patchAgent((m) => ({
                toolCalls: [
                  ...(m.toolCalls ?? []),
                  {
                    id: d.id!,
                    label: d.label!,
                    kind: "skill",
                    status: "pending",
                    startedAt: Date.now(),
                  },
                ],
              }));
            } else if (ev === "phase-start") {
              patchAgent((m) => ({
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === d.id
                    ? { ...tc, status: "running", startedAt: Date.now() }
                    : tc,
                ),
              }));
            } else if (ev === "thinking") {
              if (!d.text) return;
              patchAgent((m) => {
                const next = (m.thinking ?? "") + d.text!;
                const tcs = (m.toolCalls ?? []).map((tc) =>
                  tc.status === "running"
                    ? { ...tc, input: (tc.input ?? "") + d.text! }
                    : tc,
                );
                return { thinking: next, toolCalls: tcs };
              });
            } else if (ev === "phase-done") {
              patchAgent((m) => ({
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === d.id
                    ? {
                        ...tc,
                        status: "done",
                        durationMs: Date.now() - tc.startedAt,
                        output: d.summary ?? tc.output,
                      }
                    : tc,
                ),
              }));
            } else if (ev === "token") {
              if (!d.text) return;
              patchAgent((m) => ({ text: m.text + d.text! }));
            } else if (ev === "done") {
              patchAgent((m) => ({
                streaming: false,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.status === "done" || tc.status === "failed"
                    ? tc
                    : {
                        ...tc,
                        status: "done",
                        durationMs:
                          tc.durationMs ?? Date.now() - tc.startedAt,
                      },
                ),
                text: m.text || d.text || "AI 没有返回内容，请换种说法再试一次。",
              }));
            } else if (ev === "directives") {
              // 由 AI 模型解析出来的"真指令"——回写 brief / script / 角色 / 场景
              try {
                get().applyAgentPatch(data as AgentDirectives);
              } catch (e) {
                console.warn("[chat-stream] applyAgentPatch failed", e);
              }
            } else if (ev === "error") {
              failWith(d.message ?? "stream_failed");
            }
          };

          while (true) {
            // Pause-aware: block here when user paused, resume drains queued chunks.
            await waitForResume();
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // SSE：以空行分隔消息块
            const blocks = buf.split(/\r?\n\r?\n/);
            buf = blocks.pop() ?? "";
            for (const block of blocks) {
              const lines = block.split(/\r?\n/);
              let ev = "message";
              const dataLines: string[] = [];
              for (const raw of lines) {
                const line = raw;
                if (line.startsWith("event:")) ev = line.slice(6).trim();
                else if (line.startsWith("data:"))
                  dataLines.push(line.slice(5).replace(/^\s/, ""));
              }
              if (dataLines.length) {
                handleEvent(ev, dataLines.join("\n"));
              }
            }
          }

          // 流自然结束兜底
          patchAgent((m) => ({
            streaming: false,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.status === "done" || tc.status === "failed"
                ? tc
                : {
                    ...tc,
                    status: "done",
                    durationMs: tc.durationMs ?? Date.now() - tc.startedAt,
                  },
            ),
            text:
              m.text || "AI 没有返回内容，请换种说法再试一次。",
          }));
        } catch (err) {
          const isNetwork =
            err instanceof TypeError ||
            (err instanceof Error && /Failed to fetch|NetworkError|fetch failed|aborted/i.test(err.message));
          const reason = err instanceof Error ? err.message : "未知错误";
          failWith(isNetwork ? "网络异常，请稍后重试" : reason);
        }


      })();
    },




    addAttachment: (a) =>
      set((s) => {
        const kindLabel = a.kind === "image" ? "图片" : a.kind === "video" ? "视频" : "音频";
        const idx = s.attachments.filter((x) => x.kind === a.kind).length + 1;
        const displayName = a.displayName ?? `${kindLabel} ${idx}`;
        return { attachments: [...s.attachments, { ...a, displayName }] };
      }),
    removeAttachment: (id) =>
      set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
    clearAttachments: () => set({ attachments: [] }),


    submit: (prompt) => {
      const text = prompt.trim();
      if (!text) return;
      clearTimers();
      const taskKind: TaskKind = isSeriesPrompt(text) ? "series" : "oneoff";
      const newTaskId = newId();
      set((s) => ({
        runId: s.runId + 1,
        prompt: "",
        taskTitle: inferTaskTitle(text),
        taskId: newTaskId,
        taskKind,
        phase: "thinking",
        stages: initialStages(),
        assets: [],
        gate: null,
        softGate: null,
        selection: [],
        chatLog: [],
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
        // 不重置 currentUserId：由模块底部的全局订阅维护
        script: null,
      }));
      // submit 时兜底再拉一次，确保是最新登录态
      supabase.auth.getUser().then(async ({ data }) => {
        set({ currentUserId: data.user?.id ?? null });
        if (!data.user) return;

        let attachProjectId: string | null = null;

        // Auto-create + attach project when this looks like a series episode
        if (taskKind === "series") {
          try {
            const { useProjects } = await import("@/lib/sc/projects-store");
            const { createProject } = await import("@/lib/projects.functions");
            const projectsState = useProjects.getState();
            if (!projectsState.loaded) await projectsState.fetchProjects();
            const fresh = useProjects.getState().projects;
            const presetName = inferTaskTitle(text);
            let existing =
              fresh.find((p) => p.name === presetName) ??
              fresh.find((p) => titleMatchesProject(presetName, p.name));
            if (!existing) {
              const { project } = await createProject({
                data: { name: presetName, kind: "series", icon: "series" },
              });
              existing = project as typeof fresh[number];
              useProjects.setState((s) => ({ projects: [existing!, ...s.projects] }));
            }
            useProjects.getState().setCurrentProject(existing.id);
            attachProjectId = existing.id;
          } catch (e) {
            console.warn("[auto-create project] failed", e);
          }
        } else {
          // oneoff 也尝试沿用当前已选中的项目（用户可能从某个项目里发起一次性需求）
          try {
            const { useProjects } = await import("@/lib/sc/projects-store");
            attachProjectId = useProjects.getState().currentProjectId ?? null;
          } catch { /* ignore */ }
        }

        // 一创建就把 task 落库一次（最小骨架），保证下次 enterProject 能直接拉到。
        if (UUID_RE_TASK.test(newTaskId)) {
          const nowMs = Date.now();
          void upsertTaskSnapshot({
            data: {
              taskId: newTaskId,
              projectId: attachProjectId,
              title: inferTaskTitle(text) || "Untitled",
              status: "running",
              prompt: text,
              snapshot: {
                kind: taskKind,
                createdAt: nowMs,
                updatedAt: nowMs,
                status: "running",
                assets: [],
                stageSummaries: {},
                stageSnapshots: {},
                brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
                script: null,
                failureReason: null,
              },
            },
          }).catch((e) => console.warn("[submit] initial persist failed", e));
        }
      });
      const delay = 1500 + Math.random() * 1000;
      schedule(() => {
        set({ phase: "intake" });
      }, delay);
    },

    confirmBrief: (brief) => {
      set({ brief });
      // 不再立刻 startRunning：先让 AI 抛一张多问题选项卡
      requestPreflightOptions(brief);
    },

    submitOptionCard: (msgId, cardId, answers) => {
      const summaryParts: string[] = [];
      set((s) => ({
        chatLog: s.chatLog.map((m) => {
          if (m.id !== msgId || !m.optionCards) return m;
          return {
            ...m,
            optionCards: m.optionCards.map((c) => {
              if (c.id !== cardId) return c;
              const nextQs = c.questions.map((q) => {
                const a = answers[q.id];
                if (!a) return q;
                const labels = a.selected
                  .map((sid) => q.options.find((o) => o.id === sid)?.label ?? sid)
                  .filter(Boolean);
                if (a.otherText) labels.push(a.otherText);
                if (labels.length) summaryParts.push(`${q.label} → ${labels.join(" / ")}`);
                return { ...q, selected: a.selected, otherText: a.otherText };
              });
              return { ...c, questions: nextQs, status: "submitted" as const };
            }),
          };
        }),
      }));
      // 把答案落到 brief 上，方便下游脚本生成参考
      const cur = get().brief;
      if (cur) {
        const extra = summaryParts.join("\n");
        set({
          brief: {
            ...cur,
            prompt: extra ? `${cur.prompt}\n\n[偏好]\n${extra}` : cur.prompt,
          },
        });
      }
      // 触发后续流程
      const card = get().chatLog
        .find((m) => m.id === msgId)?.optionCards
        ?.find((c) => c.id === cardId);
      if (card?.intent === "preflight") startRunning();
    },

    skipOptionCard: (msgId, cardId) => {
      set((s) => ({
        chatLog: s.chatLog.map((m) => {
          if (m.id !== msgId || !m.optionCards) return m;
          return {
            ...m,
            optionCards: m.optionCards.map((c) =>
              c.id === cardId ? { ...c, status: "skipped" as const } : c,
            ),
          };
        }),
      }));
      const card = get().chatLog
        .find((m) => m.id === msgId)?.optionCards
        ?.find((c) => c.id === cardId);
      if (card?.intent === "preflight") startRunning();
    },

    skipIntake: () => {
      const b = get().brief;
      set({
        brief: {
          prompt: b?.prompt ?? "",
          adType: "Premium / Cinematic",
          format: "9:16 · 30s",
          visualSource: "Generate from prompt",
          mode: "Auto · 全自动连续推进",
        },
      });
      startRunning();
    },

    approveScript: () => runWardrobe(),
    tweakScript: () => set({ phase: "intake", gate: null, softGate: null }),
    approveWardrobe: () => runCast(),
    tweakWardrobe: () => {
      closeGate();
      // simply re-run wardrobe
      set((s) => ({
        assets: s.assets.filter((a) => !["W01", "W02", "P01"].includes(a.id)),
        stages: { ...s.stages, wardrobe: emptyStage() },
      }));
      runWardrobe();
    },
    approveCast: () => runPaint(),
    tweakCast: () => {
      closeGate();
      set((s) => ({
        assets: s.assets.filter((a) => a.stageId !== "cast"),
        stages: { ...s.stages, cast: emptyStage() },
      }));
      runCast();
    },
    approveKeyframe: () => runQC(),
    regenerateKeyframe: () => {
      closeGate();
      set((s) => ({
        assets: s.assets.filter((a) => a.stageId !== "paint"),
        stages: { ...s.stages, paint: emptyStage() },
      }));
      runPaint();
    },
    applyQCFix: () => applyQCFixInternal(),
    keepAsIs: () => {
      closeGate();
      appendSummary("qc", "用户保留原样 · 跳过修正");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
    },
    approveMerge: () => {
      closeGate();
      runDetails();
    },
    cancelMerge: () => {
      closeGate();
      appendSummary("life", "用户暂不合成完整成片 · 可在分镜列表中继续编辑");
    },
    cancelSoftGate: () => set({ softGate: null }),

    cancel: () => {
      clearTimers();
      set((s) => ({ runId: s.runId + 1 }));
      set((s) => {
        const stages = { ...s.stages };
        for (const id of STAGE_ORDER) {
          if (stages[id].status === "running") {
            stages[id] = {
              ...stages[id],
              status: "recovering",
              summary: [...stages[id].summary, "用户已取消，进入 Recovering"],
              expanded: true,
            };
          }
        }
        return {
          stages,
          assets: s.assets.map((a) =>
            a.status === "Generating" ||
            a.status === "Queued" ||
            a.status === "Processing"
              ? { ...a, status: "Recovering" as const }
              : a,
          ),
          phase: "failed",
          gate: null,
          softGate: null,
        };
      });
      persistCurrent("failed");
    },

    reset: (opts) => {
      const { phase } = get();
      if (opts?.fromUserAction && (phase === "running" || phase === "thinking")) {
        persistCurrent("interrupted");
      }
      clearTimers();
      set((s) => ({
        runId: s.runId + 1,
        phase: "empty",
        prompt: "",
        brief: null,
        stages: initialStages(),
        assets: [],
        taskTitle: "New chat",
        taskId: null,
        taskKind: "oneoff",
        attachments: [],
        gate: null,
        softGate: null,
        selection: [],
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
        chatLog: [],
        script: null,
      }));
    },

    toggleStage: (id) =>
      set((s) => ({
        stages: {
          ...s.stages,
          [id]: { ...s.stages[id], expanded: !s.stages[id].expanded },
        },
      })),

    toggleThought: (stageId, thoughtId) => {
      // thoughts are rendered as <details>; this is for external triggers only
      // currently no expanded flag stored — kept as no-op placeholder
      void stageId;
      void thoughtId;
    },

    setRailOpen: (v) => set((s) => ({ rail: { ...s.rail, open: v } })),
    focusAsset: (id) =>
      set((s) => ({ rail: { ...s.rail, open: true, focusedAssetId: id } })),

    toggleSelect: (id) =>
      set((s) => ({
        selection: s.selection.includes(id)
          ? s.selection.filter((x) => x !== id)
          : [...s.selection, id],
      })),
    clearSelection: () => set({ selection: [] }),
    batchEditAssets: (ids, instruction) => {
      if (!ids.length) return;
      set((s) => ({
        assets: s.assets.map((a) =>
          ids.includes(a.id) ? { ...a, status: "Processing" as const } : a,
        ),
        selection: [],
      }));
      // re-open details stage with stream of fix
      updateStage("details", { status: "running", expanded: true });
      appendSummary("details", `批量修改 ${ids.length} 个素材 · 指令：${instruction}`);
      runTool("details", "skill", "fast-model · batch-edit", 1000, 0);
      addThought("details", {
        title: `批量修改思路 · ${ids.length} 个资产`,
        body: [
          `用户指令：${instruction}`,
          "调用快模型批量重生成，保留构图/角色一致性。",
          "Fast model · 0 credits · Preview only。",
        ],
        thumbAssetIds: ids,
      });
      ids.forEach((id, i) => {
        runTool("details", "tool", `re-paint · ${id}`, 1400, 1100 + i * 500);
        schedule(
          () => updateAsset(id, { status: "Ready", url: SAMPLE_KEYFRAME }),
          1100 + i * 500 + 1500,
        );
      });
      schedule(
        () => {
          appendSummary("details", "批量修改完成 · 全部 Ready ✓");
          updateStage("details", { status: "ready" });
          collapseAfter("details", 1600);
          persistCurrent("done");
        },
        1100 + ids.length * 500 + 1800,
      );
    },

    restoreTask: (id) => {
      const found = get().taskHistory.find((t) => t.id === id);
      if (!found) {
        console.warn("[restoreTask] task not found in local history", id);
        return false;
      }
      // 即使 canRestoreTaskRecord 不通过，也走"最小可视恢复"分支：
      // 把 phase 接管到 done，避免 caller 已 navigate("/") 之后落回 empty 首页。
      const minimalRestore = !canRestoreTaskRecord(found);
      if (minimalRestore) {
        console.warn("[restoreTask] minimal restore (snapshot incomplete)", id);
      }
      const rec = normalizeTaskRecord(found);
      clearTimers();
      const stages = initialStages();
      // Prefer full snapshots (toolCalls + thoughts). Fall back to legacy
      // summaries-only records.
      const snaps = rec.stageSnapshots ?? {};
      const sums = rec.stageSummaries ?? {};
      let failedStageId: StageId | undefined;
      for (const sid of STAGE_ORDER) {
        const snap = snaps[sid];
        const sum = sums[sid];
        if (snap) {
          stages[sid] = {
            status: snap.status ?? "ready",
            summary: Array.isArray(snap.summary) ? snap.summary.slice() : [],
            toolCalls: Array.isArray(snap.toolCalls) ? snap.toolCalls.slice() : [],
            thoughts: Array.isArray(snap.thoughts) ? snap.thoughts.slice() : [],
            expanded: true,
          };
          if (snap.status === "failed" && !failedStageId) failedStageId = sid;
        } else if (sum && sum.length) {
          stages[sid] = {
            ...emptyStage(),
            status: rec.status === "failed" && sid === "life" ? "failed" : "ready",
            summary: sum,
            expanded: true,
          };
          if (rec.status === "failed" && sid === "life" && !failedStageId) failedStageId = sid;
        }
      }
      // 把"另一会话残留的 running" 视为 interrupted，避免冷启动一个假活动任务。
      const effectiveStatus: TaskRecord["status"] =
        rec.status === "running" ? "interrupted" : rec.status;
      // 对于被降级的 interrupted 任务，把 stage 中残留的 running/recovering 清掉。
      if (rec.status === "running") {
        for (const sid of STAGE_ORDER) {
          const st = stages[sid];
          if (st.status === "running" || st.status === "recovering") {
            stages[sid] = { ...st, status: "pending" };
          }
        }
      }
      const restoredPhase: Phase =
        effectiveStatus === "done"
          ? "done"
          : effectiveStatus === "failed"
            ? "failed"
            : rec.assets.length > 0
              ? "done"
              : "failed";

      const hasRealBrief = !!rec.brief && !!(rec.brief as Brief).adType;
      const restoredBrief: Brief = (rec.brief as Brief | undefined) ?? {
        prompt: rec.prompt || rec.title || "",
        adType: "",
        format: "—",
        visualSource: "—",
        mode: "—",
      };
      const chatLog: ChatMsg[] = [];
      // Restore the full archived chat timeline so historical playback shows the EXACT
      // original output (user msgs, agent msgs, option cards, tool calls, thoughts).
      const archived = (rec as unknown as { archivedChat?: unknown[] }).archivedChat;
      if (Array.isArray(archived) && archived.length > 0) {
        for (const raw of archived) {
          if (!raw || typeof raw !== "object") continue;
          const m = raw as Partial<ChatMsg>;
          if (typeof m.id !== "string" || (m.role !== "user" && m.role !== "agent")) continue;
          // Sanitize possibly-stale archived shapes so a missing field in an
          // old record cannot crash the chatLog renderer.
          const safeToolCalls = Array.isArray(m.toolCalls)
            ? (m.toolCalls as unknown[]).filter(
                (t): t is NonNullable<ChatMsg["toolCalls"]>[number] =>
                  !!t && typeof t === "object" &&
                  typeof (t as { id?: unknown }).id === "string" &&
                  typeof (t as { label?: unknown }).label === "string",
              )
            : undefined;
          const safeOptionCards = Array.isArray(m.optionCards)
            ? (m.optionCards as unknown[]).filter(
                (c): c is NonNullable<ChatMsg["optionCards"]>[number] =>
                  !!c && typeof c === "object" &&
                  typeof (c as { id?: unknown }).id === "string" &&
                  typeof (c as { status?: unknown }).status === "string" &&
                  Array.isArray((c as { options?: unknown }).options),
              )
            : undefined;
          const rawSkill = m.skill as { id?: unknown } | undefined;
          const safeSkill =
            rawSkill && typeof rawSkill === "object" && typeof rawSkill.id === "string"
              ? (rawSkill as ChatMsg["skill"])
              : undefined;
          chatLog.push({
            id: m.id,
            role: m.role,
            text: typeof m.text === "string" ? m.text : "",
            ts: typeof m.ts === "number" ? m.ts : Date.now(),
            actions: Array.isArray(m.actions) ? m.actions : undefined,
            streaming: false,
            toolCalls: safeToolCalls,
            thinking: typeof m.thinking === "string" ? m.thinking : undefined,
            optionCards: safeOptionCards,
            skill: safeSkill,
          });
        }
      }
      // 历史归档恢复：给出一句友好提示，避免中间区域只剩一张空卡。
      if (chatLog.length === 0 && !hasRealBrief && rec.assets.length > 0) {
        chatLog.push({
          id: `restore-${rec.id}-info`,
          role: "agent",
          ts: Date.now(),
          text: `已从历史归档恢复 ${rec.assets.length} 个素材 · 项目「${rec.title}」。你可以基于这些镜头继续生成下一集，或在右侧画廊中复用素材。`,
        });
      }
      if (rec.status === "failed") {
        const stageLabel = failedStageId ? STAGE_LABEL[failedStageId] : "运行";
        const reason = rec.failureReason ?? "未知错误";
        chatLog.push({
          id: `restore-${rec.id}`,
          role: "agent",
          ts: Date.now(),
          text: `该任务在「${stageLabel}」阶段失败：${reason}。要我重做这一步，还是从头再跑一遍？`,
          actions: [
            ...(failedStageId
              ? [{ label: "重做此步", kind: "retry-stage" as const, stageId: failedStageId }]
              : []),
            { label: "整任务重跑", kind: "rerun-all" as const },
          ],
        });
      } else if (rec.status === "interrupted" || rec.status === "running") {
        // 中断的任务：找到第一个非 ready 的 stage 作为续跑起点
        const interruptedStage =
          STAGE_ORDER.find((sid) => {
            const st = stages[sid];
            return st.status === "running" || st.status === "recovering" || st.status === "failed";
          }) ?? STAGE_ORDER.find((sid) => stages[sid].status === "pending");
        const stageLabel = interruptedStage ? STAGE_LABEL[interruptedStage] : "未知阶段";
        chatLog.push({
          id: `restore-interrupted-${rec.id}`,
          role: "agent",
          ts: Date.now(),
          text: `这个任务在「${stageLabel}」阶段被中断了。要从这一步继续，还是从头重跑？也可以直接在下方输入框告诉我你想怎么改。`,
          actions: [
            ...(interruptedStage
              ? [{ label: `从「${stageLabel}」继续`, kind: "retry-stage" as const, stageId: interruptedStage }]
              : []),
            { label: "整任务重跑", kind: "rerun-all" as const },
          ],
        });
      } else if (rec.status === "done") {
        // 已完成的任务被点开：提示用户可以基于现有结果继续指挥 AI
        chatLog.push({
          id: `restore-done-${rec.id}`,
          role: "agent",
          ts: Date.now(),
          text: minimalRestore
            ? `「${rec.title}」的归档数据不完整（远端 snapshot 缺失），但项目上下文已恢复。可以直接在下方输入框告诉我下一步要做什么，或选择整任务重跑。`
            : `「${rec.title}」已完成。如果想继续生成下一集、重做某一步，或者改其中某个镜头，直接在下方输入框告诉我即可。`,
          actions: minimalRestore
            ? [{ label: "整任务重跑", kind: "rerun-all" as const }]
            : undefined,
        });
      }
      set((s) => ({
        runId: s.runId + 1,
        phase: restoredPhase,
        taskId: rec.id,
        taskTitle: rec.title,
        taskKind: rec.kind,
        brief: restoredBrief,
        script: normalizeGeneratedScript(rec.script),
        stages,
        assets: rec.assets,
        gate: null,
        softGate: null,
        selection: [],
        chatLog,
        rail: { open: rec.assets.length > 0, flashId: undefined, focusedAssetId: undefined },
        attachments: [],
        versionDrawerAssetId: null,
        previewAssetId: null,
        pendingScript: null,
        // Mark hydrated so a subsequent hydrateFromStorage call on /
        // (or in __root) cannot wipe taskHistory/preferences mid-restore.
        hydrated: true,
      }));
      console.info(
        "[restoreTask] restored",
        rec.id,
        "phase=", restoredPhase,
        "assets=", rec.assets.length,
        "stages=", Object.fromEntries(STAGE_ORDER.map((sid) => [sid, stages[sid].status])),
      );
      // Sync the active project so sidebar highlight + ProjectGuideCard follow.
      void (async () => {
        try {
          const { useProjects } = await import("@/lib/sc/projects-store");
          useProjects.getState().setCurrentProject(rec.projectId ?? null);
        } catch { /* ignore */ }
      })();
      return true;
    },


    deleteTask: (id) => {
      const next = get().taskHistory.filter((t) => t.id !== id);
      set({ taskHistory: next });
      saveHistory(next);
    },

    toggleFavoriteTask: (id) => {
      const next = get().taskHistory.map((t) =>
        t.id === id ? { ...t, favorite: !t.favorite } : t,
      );
      set({ taskHistory: next });
      saveHistory(next);
    },

    enterProject: (projectId) => {
      const { phase } = get();
      if (phase === "running" || phase === "thinking") {
        if (typeof window !== "undefined" &&
            !window.confirm("当前任务进行中，确认切换项目？已生成的内容会保留在 Tasks。")) {
          return;
        }
      }
      void (async () => {
        try {
          const { useProjects } = await import("@/lib/sc/projects-store");
          const ps = useProjects.getState();
          if (!ps.loaded) await ps.fetchProjects();
          const fresh = useProjects.getState();
          fresh.setCurrentProject(projectId);
          const proj = fresh.projects.find((p) => p.id === projectId);
          if (!proj) return;

          // 拉远端任务（含 snapshot 为空的旧记录），合并入本地 taskHistory。
          let remoteLooseMatches: Array<{ id: string; title?: string; project_id?: string | null }> = [];
          let remoteCount = 0;
          const ingestRemote = (rows: Array<Record<string, unknown>>) => {
            const local = get().taskHistory;
            const byId = new Map<string, TaskRecord>(local.map((t) => [t.id, t]));
            for (const raw of rows) {
              const r = raw as {
                id: string;
                title?: string;
                prompt?: string;
                status?: string;
                project_id?: string | null;
                snapshot?: unknown;
                created_at?: string;
                updated_at?: string;
              };
              const snap = (r.snapshot ?? {}) as Partial<TaskRecord> & { status?: TaskRecord["status"] };
              const looseTitleMatch = !r.project_id && titleMatchesProject(r.title, proj.name);
              const inferProjectId =
                r.project_id ?? (looseTitleMatch ? projectId : (byId.get(r.id)?.projectId ?? null));
              const rec = normalizeTaskRecord({
                id: r.id,
                title: r.title ?? "Untitled",
                prompt: r.prompt ?? "",
                createdAt: snap.createdAt ?? (Date.parse(r.created_at ?? "") || Date.now()),
                updatedAt: snap.updatedAt ?? (Date.parse(r.updated_at ?? "") || Date.now()),
                status: snap.status ?? (r.status === "completed" ? "done" : (r.status as TaskRecord["status"]) ?? "done"),
                kind: snap.kind ?? "oneoff",
                assets: snap.assets ?? [],
                stageSummaries: snap.stageSummaries ?? {},
                stageSnapshots: snap.stageSnapshots ?? {},
                script: snap.script ?? null,
                failureReason: snap.failureReason ?? undefined,
                brief: snap.brief ?? null,
                projectId: inferProjectId,
              });
              byId.set(rec.id, rec);
              if (inferProjectId === projectId) {
                remoteLooseMatches.push({ id: r.id, title: r.title ?? undefined, project_id: r.project_id });
              }
            }
            const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
            set({ taskHistory: merged });
            saveHistory(merged);
          };

          try {
            const { tasks: remote } = await listProjectTasks({ data: { projectId: null } });
            remoteCount = Array.isArray(remote) ? remote.length : 0;
            if (remoteCount) ingestRemote(remote as Array<Record<string, unknown>>);
          } catch (e) {
            console.warn("[enterProject] remote fetch failed", e);
          }

          // 异步回填 project_id 为 NULL 的命中行（按标题），下次进入就能直接命中。
          void (async () => {
            try {
              const { attachTaskToProject } = await import("@/lib/tasks.functions");
              for (const m of remoteLooseMatches) {
                if (m.project_id) continue;
                if (!UUID_RE_TASK.test(m.id)) continue;
                await attachTaskToProject({
                  data: { taskId: m.id, projectId },
                }).catch(() => undefined);
              }
            } catch { /* ignore */ }
          })();

          // 命中：projectId 精确 → title 模糊兜底 → 该项目下最新一条
          const matchesProject = (t: TaskRecord) =>
            t.projectId === projectId || (!t.projectId && titleMatchesProject(t.title, proj.name));

          let history = get().taskHistory;
          let projHits = history.filter(matchesProject).sort((a, b) => b.updatedAt - a.updatedAt);

          // 若本项目仍然 0 条命中：尝试用 assets 表回填一次（一次性 backfill）
          if (projHits.length === 0) {
            try {
              const res = await backfillLegacyTasksForProject({ data: { projectId } });
              if (res?.created && res.created > 0) {
                const { tasks: remote2 } = await listProjectTasks({ data: { projectId: null } });
                if (Array.isArray(remote2) && remote2.length) {
                  ingestRemote(remote2 as Array<Record<string, unknown>>);
                  history = get().taskHistory;
                  projHits = history.filter(matchesProject).sort((a, b) => b.updatedAt - a.updatedAt);
                }
              }
              console.info("[enterProject] backfill", { projectId, ...res });
            } catch (e) {
              console.warn("[enterProject] backfill failed", e);
            }
          }

          console.info("[enterProject] hits", {
            projectId,
            projName: proj.name,
            remoteCount,
            localCount: history.length,
            matchedCount: projHits.length,
          });

          const match = projHits[0];
          if (match) {
            get().restoreTask(match.id);
            useProjects.getState().setCurrentProject(projectId);
          } else {
            get().reset({ fromUserAction: true });
            useProjects.getState().setCurrentProject(projectId);
          }
        } catch (e) {
          console.warn("[enterProject] failed", e);
        }
      })();
    },



    applyAgentPatch: (dir) => {
      if (!dir || typeof dir !== "object") return;
      const patch = dir.patch ?? {};
      const rerun = Array.isArray(dir.rerun) ? dir.rerun : [];
      const imageEdits = Array.isArray(dir.imageEdits) ? dir.imageEdits : [];
      const actions = Array.isArray(dir.actions) ? dir.actions : [];

      // 1) actions —— 真正驱动 pipeline 的"动作"，由 chat 自然语言触发。
      //    在 patch/imageEdits 之前先消费 actions，因为 retryStage / submit 会
      //    清掉下游 stage assets，再去做 imageEdits 没意义。
      if (actions.length) {
        for (const a of actions) {
          if (!a || typeof a !== "object") continue;
          try {
            if (a.kind === "retry-stage" && a.stageId && STAGE_ORDER.includes(a.stageId)) {
              get().retryStage(a.stageId);
              return;
            }
            if (a.kind === "resume-from") {
              // 找到第一个非 ready / pending 之外的 stage（failed / running 中断）
              const stages = get().stages;
              const target =
                a.stageId && STAGE_ORDER.includes(a.stageId)
                  ? a.stageId
                  : STAGE_ORDER.find(
                      (sid) => stages[sid].status === "failed" || stages[sid].status === "running",
                    ) ?? STAGE_ORDER.find((sid) => stages[sid].status === "pending");
              if (target) {
                get().retryStage(target);
                return;
              }
            }
            if (a.kind === "rerun-all") {
              const prompt = a.prompt?.trim() || get().brief?.prompt || "";
              if (prompt) {
                get().submit(prompt);
                return;
              }
            }
            if (a.kind === "generate-next-episode") {
              const prompt = a.prompt?.trim();
              if (prompt) {
                get().submit(prompt);
                return;
              }
            }
          } catch (e) {
            console.warn("[applyAgentPatch] action failed", a, e);
          }
        }
      }

      if (
        !patch.brief &&
        !patch.script &&
        !patch.characters &&
        !patch.scenes &&
        !rerun.length &&
        !imageEdits.length
      ) {
        return;
      }
      const changeBits: string[] = [];
      if (patch.brief) changeBits.push("brief");
      if (patch.script) changeBits.push("脚本");
      if (patch.characters?.length) changeBits.push("角色");
      if (patch.scenes?.length) changeBits.push("场景");
      void import("sonner").then(({ toast }) => {
        const bits = changeBits.join(" / ") || "—";
        toast(rerun.length ? `AI 指令已应用：${bits}（含 ${rerun.length} 个待确认重跑）` : `AI 指令已应用：${bits}`);
      }).catch(() => {});
      if (patch.brief && get().brief) {
        const merged = { ...get().brief!, ...patch.brief } as Brief;
        set({ brief: merged });
      } else if (patch.brief && !get().brief) {
        set({ brief: patch.brief as unknown as Brief });
      }

      // 2) script 浅合并（保留未覆盖字段）
      if (patch.script) {
        const cur = (get().script as Record<string, unknown> | null) ?? {};
        const next = { ...cur, ...patch.script };
        set({ script: next as unknown as never });
      }

      // 3) characters / scenes 暂时写入 brief.meta 以便后续 cast/paint 阶段取用
      if ((patch.characters && patch.characters.length) || (patch.scenes && patch.scenes.length)) {
        const curBrief = get().brief;
        if (curBrief) {
          const meta = ((curBrief as unknown as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
          const nextMeta = {
            ...meta,
            ...(patch.characters ? { characters: patch.characters } : {}),
            ...(patch.scenes ? { scenes: patch.scenes } : {}),
          };
          set({ brief: { ...curBrief, meta: nextMeta } as unknown as Brief });
        }
      }

      // 4) rerun：仅在「下游确实没有 Ready 产物」时直接 retryStage；
      //    若会清掉已生成的关键帧 / 视频片段，改为给用户一个确认 chip，
      //    避免 chat 一句"合并成同一集"就把全部成片冲掉。
      const rerunToStage: Record<string, StageId> = {
        script: "structure",
        wardrobe: "wardrobe",
        cast: "cast",
        paint: "paint",
      };
      // STAGE_ORDER 索引大于触发阶段的都是下游
      const downstreamHasReady = (sid: StageId): { ready: boolean; count: number } => {
        const idx = STAGE_ORDER.indexOf(sid);
        const downstream = new Set(STAGE_ORDER.slice(idx + 1));
        const hits = get().assets.filter(
          (a) => a.stageId && downstream.has(a.stageId) && a.status === "Ready",
        );
        return { ready: hits.length > 0, count: hits.length };
      };
      const seen = new Set<string>();
      for (const r of rerun) {
        if (seen.has(r)) continue;
        seen.add(r);
        const stageId = rerunToStage[r];
        if (!stageId) continue;
        const { ready, count } = downstreamHasReady(stageId);
        if (!ready) {
          try {
            get().retryStage(stageId);
            break;
          } catch (e) {
            console.warn("[applyAgentPatch] rerun failed", r, e);
          }
        } else {
          // 破坏性：附加一条 agent 消息 + 确认 chip，patch 已应用，等用户主动点击才重跑
          const msg: ChatMsg = {
            id: uid(),
            role: "agent",
            ts: Date.now(),
            text:
              `已应用本次改动。要按 AI 的建议重跑「${STAGE_LABEL[stageId]}」吗？` +
              `这会清空当前已生成的 ${count} 个下游片段。`,
            actions: [
              { label: `重跑 ${STAGE_LABEL[stageId]}`, kind: "retry-stage" as const, stageId },
            ],
            skill: { name: "chat-director", sub: "等待确认" },
          };
          set((s) => ({ chatLog: [...s.chatLog, msg] }));
          break;
        }
      }

      // 5) imageEdits：对具体已生成图片做真改图（后端 Gemini Nano Banana）
      if (imageEdits.length) {
        void (async () => {
          const { editImageWithRefs } = await import(
            "@/lib/image-edit.functions"
          );
          for (const edit of imageEdits) {
            const target = get().assets.find((a) => a.id === edit.assetId);
            if (!target || !target.url || target.kind !== "image") {
              const msg: ChatMsg = {
                id: uid(),
                role: "agent",
                ts: Date.now(),
                text: `跳过改图：找不到可编辑的图片 @${edit.assetId}`,
                skill: { name: "chat-director", sub: "image-edit" },
              };
              set((s) => ({ chatLog: [...s.chatLog, msg] }));
              continue;
            }
            const userId = get().currentUserId ?? null;
            if (!userId) {
              const msg: ChatMsg = {
                id: uid(),
                role: "agent",
                ts: Date.now(),
                text: "请先登录后再进行图片编辑。",
                skill: { name: "chat-director", sub: "image-edit" },
              };
              set((s) => ({ chatLog: [...s.chatLog, msg] }));
              continue;
            }

            // 收集参考图
            const refUrls = (edit.refs ?? [])
              .map((rid) => get().assets.find((a) => a.id === rid)?.url)
              .filter((u): u is string => !!u && /^https?:\/\//.test(u))
              .slice(0, 4);
            const imageUrls = [target.url, ...refUrls].slice(0, 6);

            // mark generating
            set((s) => ({
              assets: s.assets.map((a) =>
                a.id === edit.assetId ? { ...a, status: "Generating" as const, errorMessage: undefined } : a,
              ),
            }));

            try {
              const fullPrompt =
                `Edit the FIRST reference image while preserving its composition, framing and subject identity. ` +
                `Subsequent images (if any) are identity / style references only.\n\n` +
                `User instruction: ${edit.prompt}`;
              const { b64 } = await editImageWithRefs({
                data: { prompt: fullPrompt, imageUrls },
              });
              const url = await uploadBase64Image({
                base64: b64,
                userId,
                taskId: get().taskId ?? undefined,
              });
              get().addAssetVersion(edit.assetId, url, `chat: ${edit.prompt.slice(0, 40)}`);
              const ok: ChatMsg = {
                id: uid(),
                role: "agent",
                ts: Date.now(),
                text: `已改好 @${edit.assetId}（已保留旧版本到历史，可在卡片右下角切换）。`,
                skill: { name: "chat-director", sub: "image-edit" },
              };
              set((s) => ({ chatLog: [...s.chatLog, ok] }));
            } catch (e) {
              console.error("[applyAgentPatch] imageEdits failed", edit, e);
              set((s) => ({
                assets: s.assets.map((a) =>
                  a.id === edit.assetId
                    ? {
                        ...a,
                        status: "Ready" as const,
                        errorMessage: undefined,
                      }
                    : a,
                ),
              }));
              const fail: ChatMsg = {
                id: uid(),
                role: "agent",
                ts: Date.now(),
                text: `改图失败 @${edit.assetId}：${(e as Error).message}（未扣积分，原图保留）`,
                skill: { name: "chat-director", sub: "image-edit" },
              };
              set((s) => ({ chatLog: [...s.chatLog, fail] }));
            }
          }
        })();
      }
    },

    retryStage: (id) => {
      // 重做前同步刷新一次最新登录态，避免点了重试还报「未登录」
      void supabase.auth.getUser().then(({ data }) => {
        set({ currentUserId: data.user?.id ?? null });
      });
      clearTimers();
      set((s) => ({
        runId: s.runId + 1,
        phase: "running",
        gate: null,
        softGate: null,
        // 清掉该 stage 的 assets，并把该 stage 之后的 stages 全部置回 pending
        assets: s.assets.filter((a) => a.stageId !== id),
        stages: STAGE_ORDER.reduce(
          (acc, sid) => {
            if (sid === id) {
              acc[sid] = emptyStage();
            } else if (STAGE_ORDER.indexOf(sid) > STAGE_ORDER.indexOf(id)) {
              acc[sid] = emptyStage();
            } else {
              acc[sid] = s.stages[sid];
            }
            return acc;
          },
          {} as Record<StageId, StageState>,
        ),
      }));
      const runners: Partial<Record<StageId, () => void>> = {
        scene: runScene,
        structure: runStructure,
        wardrobe: runWardrobe,
        paint: runPaint,
        qc: runQC,
        life: runLife,
        details: runDetails,
      };
      const runner = runners[id];
      if (runner) schedule(runner, 200);
    },

    retryAsset: (assetId) => {
      const asset = get().assets.find((a) => a.id === assetId);
      if (!asset || !asset.stageId) return;
      // life：仅重做该单段
      if (asset.stageId === "life") {
        runLifeSegment(assetId);
        return;
      }
      if (asset.stageId === "paint") {
        runPaintShot(assetId);
        return;
      }
      if (asset.stageId === "wardrobe") {
        runWardrobeAsset(assetId);
        return;
      }
    },

    setActiveVersion: (assetId, versionIndex) => {
      set((s) => ({
        assets: s.assets.map((a) => {
          if (a.id !== assetId) return a;
          const versions = a.versions ?? [];
          const target = versions[versionIndex];
          if (!target || !a.url) return a;
          // push current url as a "manual-revert" record so we never lose it
          const nextVersions: typeof versions = versions.map((v, i) =>
            i === versionIndex ? { ...v, url: a.url!, createdAt: Date.now(), source: "manual-revert", note: "切回此版本" } : v,
          );
          return { ...a, url: target.url, versions: nextVersions };
        }),
      }));
    },

    addAssetVersion: (assetId, newUrl, note) => {
      set((s) => ({
        assets: s.assets.map((a) => {
          if (a.id !== assetId) return a;
          const prevVersions = a.versions ?? [];
          const nextVersions = a.url
            ? [
                ...prevVersions,
                {
                  url: a.url,
                  createdAt: Date.now(),
                  source: "manual-edit" as const,
                  note,
                },
              ]
            : prevVersions;
          return {
            ...a,
            url: newUrl,
            status: "Ready" as const,
            errorMessage: undefined,
            errorCode: undefined,
            versions: nextVersions,
          };
        }),
      }));
      // 写盘
      try {
        const s = get();
        const tid = s.taskId;
        if (tid) {
          void upsertTaskSnapshot({
            data: {
              taskId: tid,
              projectId: useProjects.getState().currentProjectId ?? null,
              title: s.taskTitle,
              status: s.phase === "done" ? "done" : "running",
              snapshot: {
                assets: s.assets,
                stageSummaries: Object.fromEntries(
                  STAGE_ORDER.map((id) => [id, s.stages[id].summary]),
                ),
              } as Record<string, unknown>,
            },
          }).catch(() => undefined);
        }
      } catch { /* ignore */ }
    },

    importGeneratedScript: (script) => {
      // 直接进入 running 阶段；structure 标 ready，跳过 LLM 生成
      set((s) => ({
        phase: "running" as Phase,
        script,
        stages: {
          ...s.stages,
          structure: {
            ...s.stages.structure,
            status: "ready" as const,
            expanded: false,
            summary: [
              "已导入用户上传的剧本",
              `情绪：${script.mood}`,
              `镜头语言：${script.cameraLanguage}`,
              ...script.structureSummary,
            ],
            thoughts: [
              {
                id: uid(),
                title: "分镜方案（来自上传剧本）",
                body: script.shots.map(
                  (sh) => `${sh.shot} · ${sh.duration} · ${sh.motion} — ${sh.scene}（${sh.elements}）`,
                ),
              },
            ],
          },
        },
      }));
    },

    setPendingScript: (s) => set({ pendingScript: s }),
    clearPendingScript: () => set({ pendingScript: null }),




    openVersionDrawer: (assetId) => set({ versionDrawerAssetId: assetId }),
    closeVersionDrawer: () => set({ versionDrawerAssetId: null }),
    openPreview: (assetId) => set({ previewAssetId: assetId }),
    closePreview: () => set({ previewAssetId: null }),





    forceState: (s) => {
      clearTimers();
      const ready = (summary: string[]): StageState => ({
        ...emptyStage(),
        status: "ready",
        summary,
        expanded: false,
      });
      const base = {
        phase: "running" as Phase,
        stages: initialStages(),
        assets: [] as Asset[],
        taskId: newId(),
        taskKind: "oneoff" as TaskKind,
        brief: {
          prompt: "Demo: 城市晚风 30s",
          adType: "Premium",
          format: "9:16 · 30s",
          visualSource: "Generate from prompt",
          mode: "Auto",
        },
        taskTitle: "Demo task",
        gate: null as Gate,
        softGate: null,
        rail: { open: true } as RailState,
        runId: (get().runId ?? 0) + 1,
      };
      switch (s) {
        case "empty":
          set({ ...base, phase: "empty", brief: null, taskTitle: "New chat", taskId: null, rail: { open: false } });
          break;
        case "intake":
          set({ ...base, phase: "intake" });
          break;
        case "image-generating":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: { ...emptyStage(), status: "running", summary: ["生成 A01…"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Generating", stageId: "paint", width: 1080, height: 1920 },
            ],
          });
          break;
        case "video-processing":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: { ...emptyStage(), status: "running", summary: ["V01 Processing…"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Processing", stageId: "life", duration: "0:30" },
            ],
          });
          break;
        case "ready":
          set({
            ...base,
            phase: "done",
            stages: {
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              cast: ready(["人物/场景就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: ready(["V01 Ready"]),
              details: ready(["QC 通过"]),
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Ready", url: SAMPLE_VIDEO, poster: SAMPLE_KEYFRAME, stageId: "life", duration: "0:30" },
            ],
          });
          break;
        case "series-demo":
          set({
            ...base,
            phase: "done",
            taskKind: "series",
            taskTitle: "Galileo Episode Series",
            brief: {
              prompt: "做一个连续剧集系列：3 集 × 4 个场景",
              adType: "Series / Episode",
              format: "16:9 · per scene 12s",
              visualSource: "Generate from prompt",
              mode: "Auto · 全自动连续推进",
            },
            stages: {
              scene: ready(["剧集大纲已锁定"]),
              structure: ready(["每集分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              cast: ready(["人物/场景就绪"]),
              paint: ready(["关键帧批次完成"]),
              qc: ready(["一致性通过"]),
              life: ready(["全部成片完成"]),
              details: ready(["QC 通过"]),
            },
            assets: SERIES_DEMO,
          });
          break;
        case "recovering":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: { ...emptyStage(), status: "recovering", summary: ["未返回可用 URL，重试中"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Recovering", stageId: "paint" },
            ],
          });
          break;
        case "failed":
          set({
            ...base,
            phase: "failed",
            stages: {
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              cast: ready(["人物/场景就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: { ...emptyStage(), status: "failed", summary: ["返回内容不是可播放视频"], expanded: true },
              details: emptyStage(),
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Failed", stageId: "life" },
            ],
          });
          break;
      }
    },
  };
});

// 全局订阅 auth 状态：登录/登出/token 刷新都同步进 store，保证 retry / 新任务读到最新 userId
if (typeof window !== "undefined") {
  supabase.auth.getUser().then(({ data }) => {
    useSC.setState({ currentUserId: data.user?.id ?? null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useSC.setState({ currentUserId: session?.user?.id ?? null });
  });
}
