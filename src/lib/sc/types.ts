export type StageId =
  | "scene"
  | "structure"
  | "wardrobe"
  | "paint"
  | "qc"
  | "life"
  | "details";

export const STAGE_ORDER: StageId[] = [
  "scene",
  "structure",
  "wardrobe",
  "paint",
  "qc",
  "life",
  "details",
];

export const STAGE_LABEL: Record<StageId, string> = {
  scene: "Building the scene",
  structure: "Structuring the film",
  wardrobe: "Styling wardrobe & props",
  paint: "Painting the frame",
  qc: "Self-check & consistency",
  life: "Bringing it to life",
  details: "Adding the details",
};

export type StageStatus =
  | "pending"
  | "running"
  | "ready"
  | "recovering"
  | "failed";

export type AssetStatus =
  | "Generating"
  | "Queued"
  | "Processing"
  | "Status checked"
  | "Ready"
  | "Recovering"
  | "Failed";

export interface ToolCall {
  id: string;
  kind: "skill" | "tool";
  label: string;
  /** start timestamp (ms) for live elapsed counter */
  startedAt: number;
  /** when set, freeze the elapsed at this duration (ms) */
  durationMs?: number;
  status: "running" | "done";
  /** one-line summary shown after completion */
  summary?: string;
}

export interface Thought {
  id: string;
  title: string;
  body: string[];
  /** short preview rendered in the collapsed header */
  summary?: string;
  /** asset ids whose thumbnails should render inside the thought */
  thumbAssetIds?: string[];
  /** total elapsed ms (set when finished) */
  elapsedMs?: number;
}


export interface StageState {
  status: StageStatus;
  summary: string[];
  details?: string;
  expanded: boolean;
  toolCalls: ToolCall[];
  thoughts: Thought[];
}

export interface AssetVersion {
  url: string;
  createdAt: number;
  source: "init" | "qc-fix" | "manual-retry" | "batch-edit" | "manual-edit" | "manual-revert";
  note?: string;
}

export interface Asset {
  id: string;
  kind: "image" | "video";
  label: string;
  caption?: string;
  status: AssetStatus;
  url?: string;
  poster?: string;
  width?: number;
  height?: number;
  duration?: string;
  stageId?: StageId;
  episode?: number;
  scene?: number;
  /** Human-readable failure reason (shown on the failed card). */
  errorMessage?: string;
  /** Optional machine code, e.g. "timeout", "gateway_500". */
  errorCode?: string;
  /** Previous versions (oldest first); current `url` is always the active. */
  versions?: AssetVersion[];
  /** For multi-segment video output (V01, V02, …): zero-based index. */
  segmentIndex?: number;
  /** Linked source keyframe shot id (e.g. "A01") for video segments. */
  sourceShotId?: string;
}

export interface ChatToolCall {
  id: string;
  label: string;
  kind: "skill" | "tool";
  status: "pending" | "running" | "done" | "failed";
  startedAt: number;
  durationMs?: number;
  input?: string;
  output?: string;
}

export interface ChatOptionItem {
  id: string;
  label: string;
  hint?: string;
}

export interface ChatOptionQuestion {
  id: string;
  label: string;
  multi?: boolean;
  options: ChatOptionItem[];
  allowOther?: boolean;
  selected?: string[];
  otherText?: string;
}

export interface ChatOptionCard {
  id: string;
  questions: ChatOptionQuestion[];
  status: "awaiting" | "submitted" | "skipped";
  primaryLabel?: string;
  /** which downstream action to fire on submit */
  intent?: "preflight" | "refine";
}


export interface Brief {
  prompt: string;
  adType: string;
  format: string;
  visualSource: string;
  mode: string;
}

export type Phase =
  | "empty"
  | "thinking"
  | "intake"
  | "running"
  | "done"
  | "failed";

export type Gate = "script" | "wardrobe" | "keyframe" | "qc-fix" | null;

export type AutoMode = "auto" | "confirm";

export type ViewMode = "list" | "canvas";

export type TaskKind = "oneoff" | "series";

export interface Attachment {
  id: string;
  kind: "image" | "video" | "audio";
  name: string;
  url: string;
  thumb?: string;
  source: "upload" | "url" | "asset";
  ref?: string;
}

export interface StageSnapshot {
  status: StageStatus;
  summary: string[];
  toolCalls: ToolCall[];
  thoughts: Thought[];
}

export interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "done" | "failed" | "interrupted";
  kind: TaskKind;
  assets: Asset[];
  /** Legacy lightweight per-stage summary (read-only fallback for old records). */
  stageSummaries?: Partial<Record<StageId, string[]>>;
  /** Full per-stage snapshot for playback (summary + toolCalls + thoughts). */
  stageSnapshots?: Partial<Record<StageId, StageSnapshot>>;
  /** LLM script captured at run time so playback can re-render tables. */
  script?: unknown;
  /** Final failure reason (life stage error, if any). */
  failureReason?: string;
  brief?: Brief | null;
}

