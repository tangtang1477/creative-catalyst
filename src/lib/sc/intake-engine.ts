/**
 * Infers intake chip options from user prompt.
 * Hit categories rank first, neighbors second, generic fallbacks last.
 */
type Category =
  | "auto"
  | "fragrance"
  | "beauty"
  | "fashion"
  | "tech"
  | "food"
  | "luxury";

const KEYWORDS: Record<Category, RegExp> = {
  auto: /(汽车|车|轿车|SUV|新能源|电动车|car|auto|vehicle|drive|test\s*drive)/i,
  fragrance: /(香水|香氛|fragrance|perfume|cologne|libre|chanel|dior)/i,
  beauty: /(美妆|彩妆|口红|护肤|cosmetic|makeup|lipstick|skincare|beauty)/i,
  fashion: /(服装|时装|时尚|fashion|apparel|outfit|runway|手袋|包包|handbag)/i,
  tech: /(数码|手机|laptop|耳机|电脑|科技|tech|gadget|smartphone|earbuds)/i,
  food: /(食品|饮料|coffee|咖啡|tea|奶茶|饮食|snack|food|beverage|drink)/i,
  luxury: /(奢侈|luxury|premium|high[-\s]?end|高端|豪华)/i,
};

const AD_TYPES: Record<Category, string[]> = {
  auto: ["汽车广告 / Cinematic Drive", "试驾片 / Performance"],
  fragrance: ["香水广告 / Editorial Luxury", "香氛叙事 / Story-driven"],
  beauty: ["美妆广告 / Beauty Close-up", "护肤情绪片"],
  fashion: ["时尚大片 / Runway", "造型短片"],
  tech: ["3C 数码广告 / Product Showcase", "科技感氛围片"],
  food: ["食品饮料广告 / Appetite Appeal", "生活方式短片"],
  luxury: ["Luxury / Premium 形象片"],
};

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function detectCategories(prompt: string): Category[] {
  const hits: Category[] = [];
  (Object.keys(KEYWORDS) as Category[]).forEach((c) => {
    if (KEYWORDS[c].test(prompt)) hits.push(c);
  });
  return hits;
}

const NEIGHBORS: Record<Category, Category[]> = {
  auto: ["luxury", "tech"],
  fragrance: ["beauty", "luxury", "fashion"],
  beauty: ["fragrance", "fashion"],
  fashion: ["beauty", "luxury"],
  tech: ["auto"],
  food: ["beauty"],
  luxury: ["fragrance", "fashion", "auto"],
};

export interface IntakeOptions {
  adType: string[];
  format: string[];
  visualSource: string[];
  mode: string[];
  defaults: { adType: string; format: string; visualSource: string; mode: string };
  greeting: string;
}

export function inferIntake(prompt: string): IntakeOptions {
  const hits = detectCategories(prompt);
  const primary: Category = hits[0] ?? "luxury";
  const neighborSet = unique([
    ...hits.flatMap((h) => NEIGHBORS[h]),
    "luxury",
    "fashion",
    "beauty",
  ]).filter((c) => !hits.includes(c));

  const adType = unique([
    ...hits.flatMap((h) => AD_TYPES[h]),
    ...neighborSet.slice(0, 2).flatMap((c) => AD_TYPES[c]),
    "Problem-Solution（15s 旁白叙述）",
    "Lifestyle（15s 主角出镜）",
    "High Energy（标语主导）",
  ]).slice(0, 6);

  const format = [
    "9:16 · 30s 竖屏",
    "16:9 · 15s 横屏",
    "1:1 · 6s 信息流",
    "9:16 · 60s 长片",
  ];

  const visualSource = [
    "Generate from prompt（自动生成）",
    "Use uploaded reference（上传参考图）",
    "Brand asset library（品牌素材库）",
    "Paste product / brand URL",
  ];

  const mode = [
    "Auto · 全自动连续推进",
    "Guided · 关键节点确认",
    "Manual · 我来逐步把关",
  ];

  const greetingMap: Record<Category, string> = {
    auto: "好的，我来帮你制作一支汽车广告片。让我们先确认几个关键信息：",
    fragrance: "好的，我来帮你制作一支香水广告片。让我们先确认几个关键信息：",
    beauty: "好的，我来帮你制作一支美妆广告片。让我们先确认几个关键信息：",
    fashion: "好的，我来帮你制作一支时尚短片。让我们先确认几个关键信息：",
    tech: "好的，我来帮你制作一支 3C 数码广告片。让我们先确认几个关键信息：",
    food: "好的，我来帮你制作一支食品饮料广告片。让我们先确认几个关键信息：",
    luxury: "好的，我来帮你制作一支高端广告片。让我们先确认几个关键信息：",
  };

  return {
    adType,
    format,
    visualSource,
    mode,
    defaults: {
      adType: adType[0],
      format: format[0],
      visualSource: visualSource[0],
      mode: mode[0],
    },
    greeting: greetingMap[primary],
  };
}

export function inferTaskTitle(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "New chat";
  return t.length > 28 ? t.slice(0, 28) + "…" : t;
}
