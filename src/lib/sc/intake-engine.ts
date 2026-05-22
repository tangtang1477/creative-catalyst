/**
 * Intake: 4 questions aligned with ai-video-studio skill spec.
 *  1) 视频类型  2) 投放规格  3) 画面来源  4) 创作模式
 */
const OTHERS = "Others…";
export const OTHERS_LABEL = OTHERS;

export interface IntakeOptions {
  adType: string[];        // video type
  format: string[];
  visualSource: string[];
  mode: string[];
  defaults: { adType: string; format: string; visualSource: string; mode: string };
  greeting: string;
}

const VIDEO_TYPES = [
  "Short cinema（推荐）",
  "Series · Episodes",
  "Ad · Brand film",
  "Music · Fashion",
  "Documentary · Explainer",
  "UGC · Social",
];

const FORMATS = [
  "15s · 9:16（推荐）",
  "30s · 9:16",
  "60s · 16:9",
  "30s · 1:1",
];

const VISUAL_SOURCES = [
  "自动生成角色/场景（推荐）",
  "使用上传素材",
  "产品/主体特写",
  "无人物",
];

const MODES = [
  "全自动，连续推进（推荐）",
  "关键阻塞项才问我",
  "关键节点确认",
  "严格按资料",
];

export function inferIntake(prompt: string): IntakeOptions {
  const lower = prompt.toLowerCase();
  let defaultType = VIDEO_TYPES[0];
  if (/(剧集|系列|连续剧|短剧|episode|series)/i.test(lower)) defaultType = "Series · Episodes";
  else if (/(广告|tvc|brand|品牌)/i.test(lower)) defaultType = "Ad · Brand film";
  else if (/(ugc|vlog|探店|社交)/i.test(lower)) defaultType = "UGC · Social";
  else if (/(mv|music|时装)/i.test(lower)) defaultType = "Music · Fashion";
  else if (/(纪录|科普|讲解|documentary)/i.test(lower)) defaultType = "Documentary · Explainer";

  return {
    adType: [...VIDEO_TYPES, OTHERS],
    format: [...FORMATS, OTHERS],
    visualSource: [...VISUAL_SOURCES, OTHERS],
    mode: [...MODES, OTHERS],
    defaults: {
      adType: defaultType,
      format: FORMATS[0],
      visualSource: VISUAL_SOURCES[0],
      mode: MODES[0],
    },
    greeting:
      "告诉我视频类型与目标，或直接按推荐项继续。我会按 ai-video-studio 流程推进。",
  };
}

export function inferTaskTitle(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "New chat";
  return t.length > 28 ? t.slice(0, 28) + "…" : t;
}
