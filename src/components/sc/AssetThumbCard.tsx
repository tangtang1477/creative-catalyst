import type { Asset } from "@/lib/sc/types";
import { Image as ImageIcon, Film, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";

interface Props {
  asset: Asset;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  highlighted?: boolean;
}

/** Square thumbnail card for the gallery grid view. */
export function AssetThumbCard({
  asset,
  selectable = false,
  selected = false,
  onToggle,
  highlighted = false,
}: Props) {
  const focusAsset = useSC((s) => s.focusAsset);
  const Icon = asset.kind === "image" ? ImageIcon : Film;
  const thumb = asset.kind === "image" ? asset.url : asset.poster;

  const handleClick = () => {
    if (selectable) {
      onToggle?.(asset.id);
    } else {
      focusAsset(asset.id);
      const el = document.querySelector(
        `[data-stage-id="${asset.stageId}"]`,
      ) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const statusColor =
    asset.status === "Ready"
      ? "bg-status-ready"
      : asset.status === "Failed"
        ? "bg-status-failed"
        : asset.status === "Generating" || asset.status === "Processing" || asset.status === "Queued"
          ? "bg-status-generating animate-pulse"
          : "bg-muted-foreground";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-all hover:border-accent/50",
        highlighted && "[animation:rail-flash_1.5s_ease-out_1]",
        selected && "ring-2 ring-accent",
      )}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={asset.label}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10.5px] text-muted-foreground">
          <Icon className="h-5 w-5 opacity-40" />
        </div>
      )}

      {/* Top status row */}
      <div className="absolute inset-x-1 top-1 flex items-center justify-between">
        <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} />
        {selectable && (
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/30 bg-black/30 text-transparent backdrop-blur",
            )}
          >
            ✓
          </span>
        )}
      </div>

      {/* Video play indicator */}
      {asset.kind === "video" && (
        <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] font-medium text-white/85 backdrop-blur">
          <Play className="inline h-2.5 w-2.5" />
        </span>
      )}

      {/* Bottom label gradient */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pb-1 pt-3">
        <span className="truncate font-mono text-[10px] font-semibold tracking-wider text-white">
          {asset.label}
        </span>
        {asset.duration && (
          <span className="shrink-0 font-mono text-[9px] text-white/80">
            {asset.duration}
          </span>
        )}
      </div>
    </button>
  );
}
