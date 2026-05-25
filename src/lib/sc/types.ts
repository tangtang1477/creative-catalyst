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
}

export interface Thought {
  id: string;
  title: string;
  body: string[];
  /** asset ids whose thumbnails should render inside the thought */
  thumbAssetIds?: string[];
}

export interface StageState {
  status: StageStatus;
  summary: string[];
  details?: string;
  expanded: boolean;
  toolCalls: ToolCall[];
  thoughts: Thought[];
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
  kind: "image" | "video";
  name: string;
  url: string;
  thumb?: string;
  source: "upload" | "url" | "asset";
  ref?: string;
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
}
