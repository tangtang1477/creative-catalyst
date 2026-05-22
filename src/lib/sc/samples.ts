import keyframe from "@/assets/sample-keyframe.jpg";

export const SAMPLE_KEYFRAME = keyframe;

// Public sample video — small, hosted by Google
export const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export const SCRIPT_ROWS = [
  {
    time: "0–3s",
    visual: "蓝色暮光下的香水瓶特写，缓慢推近",
    vo: "When the night begins —",
    sound: "细弦乐 + 轻呼吸",
  },
  {
    time: "3–10s",
    visual: "主角侧面剪影，香气化作金色光丝缠绕",
    vo: "she chooses to be free.",
    sound: "弦乐渐强",
  },
  {
    time: "10–20s",
    visual: "主角推开落地窗走向阳台，风扬起衣摆",
    vo: "Libre. Be your own muse.",
    sound: "节奏鼓点进入",
  },
  {
    time: "20–28s",
    visual: "香水瓶旋转特写，反射夜色城市灯光",
    vo: "—",
    sound: "副歌",
  },
  {
    time: "28–30s",
    visual: "Logo 浮现 + slogan",
    vo: "YSL Libre.",
    sound: "尾韵",
  },
];

export const STORYBOARD_ROWS = [
  {
    shot: "A01",
    duration: "3s",
    motion: "Slow push-in",
    scene: "巴黎公寓夜景 / 化妆台",
    elements: "香水瓶 · 镜面反射 · 烛光",
  },
  {
    shot: "A02",
    duration: "7s",
    motion: "Side dolly",
    scene: "客厅落地窗",
    elements: "主角剪影 · 金色光丝",
  },
  {
    shot: "A03",
    duration: "10s",
    motion: "Tracking",
    scene: "阳台 / 夜空",
    elements: "主角 · 风 · 城市灯火",
  },
  {
    shot: "A04",
    duration: "8s",
    motion: "Macro rotate",
    scene: "产品特写",
    elements: "香水瓶 · 反光",
  },
  {
    shot: "A05",
    duration: "2s",
    motion: "Hold",
    scene: "Logo 卡",
    elements: "Logo · slogan",
  },
];

export const KEYFRAME_PROMPT_DETAIL = `A grand Haussmann-era Parisian apartment interior at blue hour, early evening transitioning into night. Tall ceiling with restored ornate crown molding, wide herringbone oak parquet floor in warm honey-amber, walls in pale champagne with brushed gold trim strips. Floor-to-ceiling casement windows on the right wall open slightly, sheers drifting in cool air, the deep cobalt-navy evening sky visible beyond with the faint silhouette of Paris rooftops. On the polished lacquer dressing table sits the YSL Libre perfume bottle, light catching the gold cap. Cinematic depth of field, editorial luxury photography.`;

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
