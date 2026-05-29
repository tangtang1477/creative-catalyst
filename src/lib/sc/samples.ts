import keyframe from "@/assets/sample-keyframe.jpg";

export const SAMPLE_KEYFRAME = keyframe;

// Public sample video — small, hosted by Google
export const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export const SCRIPT_ROWS = [
  { time: "0–3s", visual: "开场建立环境与主体", vo: "Hook —", sound: "环境底噪 + 轻节奏" },
  { time: "3–10s", visual: "主体行动 / 情绪推进", vo: "story beat", sound: "节奏渐强" },
  { time: "10–20s", visual: "高潮镜头 / 主张呈现", vo: "key message", sound: "鼓点进入" },
  { time: "20–28s", visual: "特写收束 / 细节强调", vo: "—", sound: "副歌" },
  { time: "28–30s", visual: "Logo / Slogan 卡", vo: "outro", sound: "尾韵" },
];

export const STORYBOARD_ROWS = [
  { shot: "A01", duration: "3s", motion: "Slow push-in", scene: "开场建立镜头", elements: "主体 · 环境" },
  { shot: "A02", duration: "7s", motion: "Side dolly", scene: "主体行动", elements: "主体 · 情绪" },
  { shot: "A03", duration: "10s", motion: "Tracking", scene: "高潮镜头", elements: "主体 · 动态" },
  { shot: "A04", duration: "8s", motion: "Macro rotate", scene: "细节特写", elements: "关键道具" },
  { shot: "A05", duration: "2s", motion: "Hold", scene: "Logo 卡", elements: "Logo · slogan" },
];

/** Neutral fallback only — do NOT splice into prompts when user brief exists. */
export const KEYFRAME_PROMPT_DETAIL = `Cinematic short film keyframe, balanced composition, soft natural lighting, shallow depth of field, premium editorial look. Subject and environment must match the user's brief.`;

export const RECOVERY_NOTES = `如果 MovieFlow 图像端口未返回可用 URL，自动转入 Recovering：保留同一关键帧 prompt，60s 后重试一次；视频端口若返回 task id 但轮询超时，则保持 Status checked，继续轮询不退出。`;

import type { Asset } from "./types";

/** Demo dataset for the ?state=series-demo route — 3 episodes × 4 scenes. */
export const SERIES_DEMO: Asset[] = (() => {
  const out: Asset[] = [];
  for (let ep = 1; ep <= 3; ep++) {
    for (let sc = 1; sc <= 4; sc++) {
      out.push({
        id: `EP${ep}-A${sc.toString().padStart(2, "0")}`,
        kind: "image",
        label: `EP${ep}·S${sc.toString().padStart(2, "0")}`,
        caption: `Episode ${ep} · Scene ${sc} · Keyframe`,
        status: "Ready",
        url: keyframe,
        stageId: "paint",
        width: 1920,
        height: 1080,
        episode: ep,
        scene: sc,
      });
      out.push({
        id: `EP${ep}-V${sc.toString().padStart(2, "0")}`,
        kind: "video",
        label: `EP${ep}·S${sc.toString().padStart(2, "0")}`,
        caption: `Episode ${ep} · Scene ${sc} · Cut`,
        status: "Ready",
        url: SAMPLE_VIDEO,
        poster: keyframe,
        stageId: "life",
        duration: "0:12",
        episode: ep,
        scene: sc,
      });
    }
  }
  return out;
})();
