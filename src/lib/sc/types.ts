export type StageId =
  | "scene"
  | "structure"
  | "paint"
  | "life"
  | "details";

export const STAGE_ORDER: StageId[] = [
  "scene",
  "structure",
  "paint",
  "life",
  "details",
];

export const STAGE_LABEL: Record<StageId, string> = {
  scene: "Building the scene",
  structure: "Structuring the film",
  paint: "Painting the frame",
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

export interface StageState {
  status: StageStatus;
  summary: string[];
  details?: string;
  expanded: boolean;
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

export type Gate = "script" | "keyframe" | null;

export type AutoMode = "auto" | "confirm";

export type TaskKind = "oneoff" | "series";

export interface Attachment {
  id: string;
  kind: "image" | "video";
  name: string;
  url: string;      // object url or external url
  thumb?: string;
  source: "upload" | "url" | "asset";
  ref?: string;     // e.g. "A01" for @mention reference
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
