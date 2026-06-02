import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import type { Asset } from "@/lib/sc/types";
import { cn } from "@/lib/utils";

/**
 * Inline 版本切换器 — 叠加在卡片右下角。
 * ≤3 版本：圆点；>3 版本：v{n}/{total} 数字 badge。
 */
export function AssetVersionSwitcher({
  asset,
  variant = "card",
}: {
  asset: Asset;
  variant?: "card" | "thumb";
}) {
  const setActiveVersion = useSC((s) => s.setActiveVersion);
  const versions = asset.versions ?? [];
  const total = versions.length + (asset.url ? 1 : 0);
  if (total < 2) return null;

  // current live url is conceptually index = total - 1
  const currentIndex = total - 1;
  const dotsMode = total <= 3;

  const go = (delta: number) => {
    const next = currentIndex + delta;
    if (next < 0 || next >= total || next === currentIndex) return;
    if (next < versions.length) setActiveVersion(asset.id, next);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute z-20 flex items-center gap-1 rounded-full bg-black/60 px-1 py-0.5 backdrop-blur transition-opacity",
        variant === "card" ? "bottom-2 right-2" : "bottom-1 right-1",
        "opacity-90 group-hover:opacity-100",
      )}
    >
      <button
        type="button"
        aria-label="previous version"
        disabled={currentIndex === 0}
        onClick={() => go(-1)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      {dotsMode ? (
        <div className="flex items-center gap-0.5 px-0.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-1 rounded-full transition-colors",
                i === currentIndex ? "bg-accent" : "bg-white/35",
              )}
            />
          ))}
        </div>
      ) : (
        <span className="px-1 font-mono text-[9.5px] font-semibold text-white">
          v{currentIndex + 1}/{total}
        </span>
      )}
      <button
        type="button"
        aria-label="next version"
        disabled={currentIndex >= total - 1}
        onClick={() => go(1)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
