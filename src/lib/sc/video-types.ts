/**
 * Video-type adaptive config — drives Building-the-scene fields,
 * Structuring output shape, and Adding-the-details "Next" chips.
 * Mirrors the ai-video-studio skill type-adaptation matrix.
 */
export type VideoType =
  | "series"
  | "short_cinema"
  | "ad"
  | "music"
  | "doc"
  | "ugc"
  | "abstract";

export const VIDEO_TYPE_LABEL: Record<VideoType, string> = {
  series: "Series · Episodes",
  short_cinema: "Short cinema",
  ad: "Ad · Brand film",
  music: "Music · Fashion",
  doc: "Documentary · Explainer",
  ugc: "UGC · Social",
  abstract: "Abstract · Art film",
};

export const NEXT_CHIPS: Record<VideoType, string[]> = {
  series: ["下一集", "角色一致性", "世界观扩展", "字幕/旁白", "封面图", "改节奏"],
  short_cinema: ["扩展下一场", "角色一致性", "字幕/旁白", "封面图", "改节奏", "比例导出"],
  ad: ["A/B variant", "字幕/旁白", "封面图", "改节奏", "比例导出"],
  music: ["改节奏", "造型 variant", "字幕/旁白", "封面图", "比例导出"],
  doc: ["补充事实", "字幕/旁白", "图表 b-roll", "封面图", "改节奏"],
  ugc: ["改 hook", "字幕/旁白", "封面图", "改节奏", "平台适配"],
  abstract: ["改 motif", "改节奏", "封面图", "调色 variant", "比例导出"],
};

export const SCENE_FIELDS: Record<VideoType, { label: string; value: string }[]> = {
  series: [
    { label: "Series premise", value: "—" },
    { label: "World rules", value: "—" },
    { label: "Recurring cast", value: "C01, C02" },
    { label: "Season arc", value: "—" },
  ],
  short_cinema: [
    { label: "Premise", value: "—" },
    { label: "Protagonist", value: "—" },
    { label: "Conflict", value: "—" },
    { label: "Mood / World", value: "—" },
  ],
  ad: [
    { label: "Product", value: "—" },
    { label: "Audience", value: "—" },
    { label: "Promise", value: "—" },
    { label: "CTA / Compliance", value: "—" },
  ],
  music: [
    { label: "Rhythm", value: "—" },
    { label: "Styling", value: "—" },
    { label: "Motif", value: "—" },
    { label: "Choreography", value: "—" },
  ],
  doc: [
    { label: "Thesis", value: "—" },
    { label: "Key facts", value: "—" },
    { label: "Audience", value: "—" },
    { label: "Evidence plan", value: "—" },
  ],
  ugc: [
    { label: "Hook (first 3s)", value: "—" },
    { label: "Creator POV", value: "—" },
    { label: "Platform", value: "—" },
    { label: "Retention", value: "—" },
  ],
  abstract: [
    { label: "Theme", value: "—" },
    { label: "Texture", value: "—" },
    { label: "Transformation", value: "—" },
    { label: "Emotion", value: "—" },
  ],
};

export function detectVideoType(prompt: string, adType?: string): VideoType {
  const t = (prompt + " " + (adType ?? "")).toLowerCase();
  if (/(剧集|系列|连续剧|短剧|episode|series|s0\d|第\s*\d+\s*集)/i.test(t)) return "series";
  if (/(ugc|vlog|社交|社群|tiktok|reels|短视频探店|探店)/i.test(t)) return "ugc";
  if (/(mv|music|乐队|时装|fashion film|秀场)/i.test(t)) return "music";
  if (/(纪录|纪录片|科普|讲解|explainer|documentary|教程)/i.test(t)) return "doc";
  if (/(广告|tvc|品牌|brand|ad |cf |ecom|带货|促销)/i.test(t)) return "ad";
  if (/(实验|抽象|艺术|art film|abstract|视觉短片|motif)/i.test(t)) return "abstract";
  if (/(短片|微电影|剧情|cinema|narrative|story)/i.test(t)) return "short_cinema";
  return "short_cinema";
}
