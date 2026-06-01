import type { Asset } from "@/lib/sc/types";
import { Image as ImageIcon, Film, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import { AssetActions } from "./AssetActions";

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
  highlighted = false,
}: Props) {
  const focusAsset = useSC((s) => s.focusAsset);
  const openVersionDrawer = useSC((s) => s.openVersionDrawer);
  const Icon = asset.kind === "image" ? ImageIcon : Film;
  const thumb = asset.kind === "image" ? asset.url : asset.poster;
  const versionCount = (asset.versions?.length ?? 0) + (asset.url ? 1 : 0);
  const hasVersions = versionCount >= 2;

  const handleClick = () => {
    if (selectable) return;
    focusAsset(asset.id);
    const el = document.querySelector(
      `[data-stage-id="${asset.stageId}"]`,
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
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
    <div
      onClick={handleClick}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-all hover:border-accent/50",
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

      {/* status dot — anchored away from action buttons (top edge center-left) */}
      <span className={cn("absolute left-1/2 top-1 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full", statusColor)} />

      {/* Video play indicator */}
      {asset.kind === "video" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/55 p-1.5 backdrop-blur">
            <Play className="h-3 w-3 text-white/90" />
          </span>
        </span>
      )}

      {/* Bottom label gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pb-1 pt-3">
        <span className="truncate font-mono text-[10px] font-semibold tracking-wider text-white">
          {asset.label}
        </span>
        {asset.duration && (
          <span className="shrink-0 font-mono text-[9px] text-white/80">
            {asset.duration}
          </span>
        )}
      </div>

      <AssetActions
        asset={asset}
        selectable={selectable}
        selected={selected}
        variant="thumb"
      />
    </div>
  );
}

