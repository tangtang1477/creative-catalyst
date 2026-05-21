import { Image as ImageIcon, Film } from "lucide-react";
import type { Asset } from "@/lib/sc/types";
import { StatusBadge } from "./StatusBadge";

export function AssetCard({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const Icon = asset.kind === "image" ? ImageIcon : Film;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12.5px] font-medium">{asset.label}</span>
        </div>
        <StatusBadge status={asset.status} />
      </div>

      {asset.kind === "image" && asset.url ? (
        <img
          src={asset.url}
          alt={asset.label}
          loading="lazy"
          className="block w-full object-cover"
          style={{ aspectRatio: compact ? "9 / 16" : "9 / 16", maxHeight: compact ? 220 : 360 }}
        />
      ) : asset.kind === "video" && asset.url ? (
        <video
          src={asset.url}
          poster={asset.poster}
          controls
          className="block w-full bg-black"
          style={{ aspectRatio: "16 / 9", maxHeight: compact ? 220 : 360 }}
        />
      ) : (
        <div
          className="flex items-center justify-center bg-background/40 text-[11px] text-muted-foreground"
          style={{ aspectRatio: asset.kind === "image" ? "9 / 16" : "16 / 9", maxHeight: 220 }}
        >
          {asset.status === "Failed" || asset.status === "Recovering"
            ? "未返回可用 URL"
            : "等待中…"}
        </div>
      )}
    </div>
  );
}
