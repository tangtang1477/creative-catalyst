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
