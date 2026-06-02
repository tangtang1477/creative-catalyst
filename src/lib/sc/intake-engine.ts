/**
 * Intake: 5 questions aligned with ai-video-studio skill spec.
 *  1) 视频类型  2) 投放规格  3) 画面来源  4) 创作模式  5) 画风
 */
const OTHERS = "Others…";
export const OTHERS_LABEL = OTHERS;

export interface IntakeOptions {
  adType: string[];
  format: string[];
  visualSource: string[];
  mode: string[];
  visualStyle: string[];
  defaults: {
    adType: string;
    format: string;
    visualSource: string;
    mode: string;
    visualStyle: string;
  };
  /** Extra options auto-added from the user prompt (e.g. "30s · 16:9"). */
  injected: { format?: string; visualStyle?: string };
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

const VISUAL_STYLES = [
  "2D 动画",
  "3D / CG",
  "真人实拍",
  "毛毡风",
  "像素风",
];

/** Extract a "{seconds}s · {ratio}" pair from free-text prompts. */
export function parseFormatFromPrompt(prompt: string): {
  seconds?: number;
  ratio?: string;
} {
  const text = prompt.toLowerCase();
  let seconds: number | undefined;
  let ratio: string | undefined;
  // 30秒 / 30s / 30 sec
  const sec = text.match(/(\d{1,3})\s*(?:s\b|秒|sec)/);
  if (sec) {
    const n = parseInt(sec[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 600) seconds = n;
  }
  const r = text.match(/(\d{1,2})\s*[:：xX]\s*(\d{1,2})/);
  if (r) ratio = `${r[1]}:${r[2]}`;
  return { seconds, ratio };
}

const STYLE_PATTERNS: Array<{ test: RegExp; label: string }> = [
  { test: /毛毡|felt/i, label: "毛毡风" },
  { test: /像素|pixel|8\s*-?\s*bit/i, label: "像素风" },
  { test: /真人|实拍|live[\s-]*action|photoreal/i, label: "真人实拍" },
  { test: /3d|cgi|cg\b/i, label: "3D / CG" },
  { test: /2d|动画|anime|卡通/i, label: "2D 动画" },
];

export function inferVisualStyle(prompt: string): string | undefined {
  for (const p of STYLE_PATTERNS) {
    if (p.test.test(prompt)) return p.label;
  }
  return undefined;
}

export function inferIntake(
  prompt: string,
  opts: { hasAttachments?: boolean } = {},
): IntakeOptions {
  const lower = prompt.toLowerCase();
  let defaultType = VIDEO_TYPES[0];
  if (/(剧集|系列|连续剧|短剧|episode|series)/i.test(lower)) defaultType = "Series · Episodes";
  else if (/(广告|tvc|brand|品牌)/i.test(lower)) defaultType = "Ad · Brand film";
  else if (/(ugc|vlog|探店|社交)/i.test(lower)) defaultType = "UGC · Social";
  else if (/(mv|music|时装)/i.test(lower)) defaultType = "Music · Fashion";
  else if (/(纪录|科普|讲解|documentary)/i.test(lower)) defaultType = "Documentary · Explainer";

  // Format: auto-detect time + ratio. If not in defaults, append a custom option.
  const { seconds, ratio } = parseFormatFromPrompt(prompt);
  let defaultFormat = FORMATS[0];
  const injected: IntakeOptions["injected"] = {};
  if (seconds && ratio) {
    const custom = `${seconds}s · ${ratio}`;
    const exist = FORMATS.find((f) => f.startsWith(custom));
    if (exist) defaultFormat = exist;
    else {
      injected.format = custom;
      defaultFormat = custom;
    }
  } else if (seconds) {
    const match = FORMATS.find((f) => f.startsWith(`${seconds}s`));
    if (match) defaultFormat = match;
    else {
      const custom = `${seconds}s · 9:16`;
      injected.format = custom;
      defaultFormat = custom;
    }
  } else if (ratio) {
    const match = FORMATS.find((f) => f.includes(ratio));
    if (match) defaultFormat = match;
  }

  // Visual style: detect from prompt; if missing, default to 2D.
  const detected = inferVisualStyle(prompt);
  const defaultStyle = detected ?? VISUAL_STYLES[0];
  if (detected && !VISUAL_STYLES.includes(detected)) {
    injected.visualStyle = detected;
  }

  return {
    adType: [...VIDEO_TYPES, OTHERS],
    format: [
      ...(injected.format ? [injected.format] : []),
      ...FORMATS,
      OTHERS,
    ],
    visualSource: [...VISUAL_SOURCES, OTHERS],
    mode: [...MODES, OTHERS],
    visualStyle: [
      ...(injected.visualStyle ? [injected.visualStyle] : []),
      ...VISUAL_STYLES,
      OTHERS,
    ],
    defaults: {
      adType: defaultType,
      format: defaultFormat,
      visualSource: VISUAL_SOURCES[0],
      mode: MODES[0],
      visualStyle: defaultStyle,
    },
    injected,
    greeting:
      "告诉我视频类型与目标，或直接按推荐项继续。我会按 ai-video-studio 流程推进。",
  };
}

export function inferTaskTitle(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "New chat";
  return t.length > 28 ? t.slice(0, 28) + "…" : t;
}

/**
 * Map a Chinese style label to an English prompt fragment used by the
 * image generation / script-writing pipeline.
 */
export function styleToPromptFragment(style: string | undefined | null): string {
  if (!style) return "";
  if (/毛毡|felt/i.test(style)) return "handmade felt-craft diorama style, soft wool textures, stop-motion vibe";
  if (/像素|pixel/i.test(style)) return "pixel-art, 16-bit retro game aesthetic, crisp blocky pixels, limited palette";
  if (/真人|实拍|live/i.test(style)) return "photorealistic live-action cinematography, natural lighting, real human actors";
  if (/3d|cgi|cg/i.test(style)) return "polished 3D CGI render, cinematic lighting, Pixar-quality shading";
  if (/2d|动画|anime|卡通/i.test(style)) return "2D animation, clean cel-shaded lineart, vibrant colors, anime film style";
  return style;
}
