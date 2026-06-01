import { useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Play,
  ExternalLink,
  Download,
  RotateCw,
  RefreshCw,
} from "lucide-react";
import type { Asset } from "@/lib/sc/types";
import { StatusBadge } from "./StatusBadge";
import { SCButton } from "./Button";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import { AssetActions } from "./AssetActions";
import { GradientLoader } from "./GradientLoader";


interface Props {
  asset: Asset;
  compact?: boolean;
  highlighted?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function AssetCard({
  asset,
  compact = false,
  highlighted = false,
  selectable = false,
  selected = false,
}: Props) {
  const Icon = asset.kind === "image" ? ImageIcon : Film;
  const focusAsset = useSC((s) => s.focusAsset);
  const retryAsset = useSC((s) => s.retryAsset);
  const openVersionDrawer = useSC((s) => s.openVersionDrawer);
  const versionCount = (asset.versions?.length ?? 0) + (asset.url ? 1 : 0);
  const hasVersions = versionCount >= 2;
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

  const isLoadingState =
    !asset.url &&
    (asset.status === "Queued" ||
      asset.status === "Generating" ||
      asset.status === "Processing" ||
      asset.status === "Recovering" ||
      asset.status === "Status checked");

  const loadingLabel =
    asset.kind === "video"
      ? asset.status === "Queued"
        ? "Queued · video"
        : asset.status === "Recovering"
          ? "Recovering video"
          : "Generating video"
      : asset.status === "Queued"
        ? "Queued · image"
        : asset.status === "Recovering"
          ? "Recovering image"
          : "Generating image";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface-2 transition-shadow [animation:asset-pop_280ms_cubic-bezier(0.22,1,0.36,1)]",
        highlighted && "[animation:rail-flash_1.5s_ease-out_1]",
        selected && "ring-2 ring-accent",
      )}
    >
      <div className="relative w-full">
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
        ) : isLoadingState ? (
          <GradientLoader
            label={loadingLabel}
            aspect={asset.kind === "image" ? "9 / 16" : "16 / 9"}
            maxHeight={compact ? (asset.kind === "image" ? 240 : 200) : asset.kind === "image" ? 420 : 360}
          />
        ) : (
          <div
            className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden border border-status-failed/40 bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,var(--status-failed)_10%,transparent)_0%,_transparent_60%)] p-4 text-center"
            style={{
              aspectRatio: asset.kind === "image" ? "9 / 16" : "16 / 9",
              maxHeight: compact ? (asset.kind === "image" ? 240 : 200) : asset.kind === "image" ? 420 : 360,
            }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-failed/15 text-status-failed">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div className="text-[12.5px] font-semibold text-foreground/90">
              生成失败
            </div>
            {asset.errorMessage && (
              <div
                className="line-clamp-3 max-w-[85%] text-[10.5px] leading-snug text-muted-foreground"
                title={asset.errorMessage}
              >
                {asset.errorMessage}
              </div>
            )}
            <div className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
              本次未扣除积分
            </div>
            <SCButton
              variant="chip"
              size="sm"
              className="mt-1 h-7 gap-1 px-3 text-[11px]"
              onClick={() => retryAsset(asset.id)}
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </SCButton>
          </div>
        )}

        {asset.kind === "video" && !asset.url && !isLoadingState && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
              <Play className="h-4 w-4 text-white/80" />
            </div>
          </div>
        )}

        <AssetActions
          asset={asset}
          selectable={selectable}
          selected={selected}
          variant="card"
        />
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
          {hasVersions && (
            <SCButton
              variant="chip"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => openVersionDrawer(asset.id)}
              title="查看版本历史"
            >
              <RefreshCw className="h-3 w-3" />
              v{versionCount}
            </SCButton>
          )}
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


