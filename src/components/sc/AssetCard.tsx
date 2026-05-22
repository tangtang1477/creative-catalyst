import { useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Play,
  ExternalLink,
  Download,
  RotateCw,
} from "lucide-react";
import type { Asset } from "@/lib/sc/types";
import { StatusBadge } from "./StatusBadge";
import { SCButton } from "./Button";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";

interface Props {
  asset: Asset;
  compact?: boolean;
  highlighted?: boolean;
}

export function AssetCard({ asset, compact = false, highlighted = false }: Props) {
  const Icon = asset.kind === "image" ? ImageIcon : Film;
  const focusAsset = useSC((s) => s.focusAsset);
  const [loaded, setLoaded] = useState(false);

  const dim =
    asset.width && asset.height
      ? `${asset.width}×${asset.height}`
      : asset.kind === "video"
        ? "1080×1920"
        : "—";

  const onOpen = () => {
    focusAsset(asset.id);
    const el = document.querySelector(
      `[data-stage-id="${asset.stageId}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1400);
    }
  };

  return (
    <div
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-surface-2 transition-shadow [animation:asset-pop_280ms_cubic-bezier(0.22,1,0.36,1)]",
        highlighted && "[animation:rail-flash_1.5s_ease-out_1]",
      )}
    >
      <div className="relative">
        {asset.kind === "image" && asset.url ? (
          <img
            src={asset.url}
            alt={asset.label}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={cn(
              "block w-full object-cover transition-[filter,opacity] duration-500",
              !loaded && "scale-[1.02] opacity-60 blur-lg",
              loaded && "blur-0 opacity-100",
            )}
            style={{
              aspectRatio: "9 / 16",
              maxHeight: compact ? 240 : 420,
            }}
          />
        ) : asset.kind === "video" && asset.url ? (
          <div className="relative">
            <video
              src={asset.url}
              poster={asset.poster}
              controls
              className="block w-full bg-black"
              style={{ aspectRatio: "16 / 9", maxHeight: compact ? 200 : 360 }}
            />
            {asset.duration && (
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {asset.duration}
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex items-center justify-center bg-background/40 text-[11px] text-muted-foreground"
            style={{
              aspectRatio: asset.kind === "image" ? "9 / 16" : "16 / 9",
              maxHeight: compact ? 200 : 280,
            }}
          >
            {asset.status === "Failed" || asset.status === "Recovering"
              ? "未返回可用 URL"
              : "等待生成…"}
          </div>
        )}

        {asset.kind === "video" && !asset.url && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
              <Play className="h-4 w-4 text-white/80" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[10.5px] font-mono font-semibold tracking-wider text-accent">
              {asset.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className="h-3 w-3" />
              {asset.kind === "image" ? "Keyframe" : "Video"}
            </span>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {asset.caption && (
          <div className="text-[11.5px] text-foreground/80">{asset.caption}</div>
        )}

        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          <span>{dim}</span>
          {asset.duration && <span>· {asset.duration}</span>}
        </div>

        <div className="flex items-center gap-1 pt-1">
          <SCButton
            variant="chip"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={onOpen}
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </SCButton>
          <SCButton
            variant="chip"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <RotateCw className="h-3 w-3" />
            Replace
          </SCButton>
          <SCButton
            variant="icon"
            size="icon"
            className="h-6 w-6"
            aria-label="download"
          >
            <Download className="h-3 w-3" />
          </SCButton>
        </div>
      </div>
    </div>
  );
}
