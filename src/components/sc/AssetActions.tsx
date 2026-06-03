import { useState } from "react";
import { Check, Download, Plus, Wand2 } from "lucide-react";
import type { Asset, Attachment } from "@/lib/sc/types";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import { LayerEditDialog } from "./LayerEditDialog";

interface Props {
  asset: Asset;
  selectable?: boolean;
  selected?: boolean;
  variant?: "thumb" | "card";
  className?: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function downloadAsset(asset: Asset) {
  const url = asset.url ?? (asset.kind === "video" ? asset.poster : undefined);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${asset.label}.${asset.kind === "video" ? "mp4" : "png"}`;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Shared hover toolbar for an asset card/thumb.
 * - top-left: select checkbox
 * - top-right: download
 * - bottom-right: add to current task (push as attachment chip)
 */
export function AssetActions({
  asset,
  selectable = false,
  selected = false,
  variant = "thumb",
  className,
}: Props) {
  const toggleSelect = useSC((s) => s.toggleSelect);
  const addAttachment = useSC((s) => s.addAttachment);
  const [editorOpen, setEditorOpen] = useState(false);

  const isReady = asset.status === "Ready" || !!asset.url;
  const canEdit = isReady && asset.kind === "image";

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isReady) return;
    const attachment: Attachment = {
      id: uid(),
      kind: asset.kind,
      name: asset.label,
      url: asset.url ?? "",
      thumb: asset.kind === "image" ? asset.url : asset.poster,
      source: "asset",
      ref: asset.label,
    };
    addAttachment(attachment);
  };

  const onDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    downloadAsset(asset);
  };

  const onSelect = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSelect(asset.id);
  };

  const alwaysVisible = selectable || selected;
  const inset = variant === "thumb" ? "4px" : "8px";
  const btnSize = variant === "thumb" ? "h-5 w-5" : "h-6 w-6";
  const iconSize = variant === "thumb" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-10", className)}>
      {/* top-left checkbox */}
      <button
        type="button"
        aria-label={selected ? "unselect" : "select"}
        onClick={onSelect}
        className={cn(
          "pointer-events-auto absolute flex items-center justify-center rounded-md border backdrop-blur transition-all",
          btnSize,
          selected
            ? "border-accent bg-accent text-accent-foreground opacity-100"
            : "border-white/40 bg-black/40 text-transparent opacity-0 group-hover:opacity-100 hover:border-white hover:text-white",
          alwaysVisible && "opacity-100",
        )}
        style={{ top: inset, left: inset }}
      >
        <Check className={iconSize} strokeWidth={3} />
      </button>

      {/* top-right: edit + download */}
      <div
        className="pointer-events-auto absolute z-10 flex items-center gap-1"
        style={{ top: inset, right: inset }}
      >
        {canEdit && (
          <button
            type="button"
            aria-label="edit image"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditorOpen(true);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-accent/85 text-accent-foreground opacity-0 backdrop-blur transition-all hover:bg-accent group-hover:opacity-100",
              btnSize,
            )}
            title="图层编辑"
          >
            <Wand2 className={iconSize} />
          </button>
        )}
        <button
          type="button"
          aria-label="download"
          onClick={onDownload}
          disabled={!isReady}
          className={cn(
            "inline-flex items-center justify-center rounded-md bg-black/55 text-white/90 opacity-0 backdrop-blur transition-all hover:bg-black/75 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0",
            btnSize,
          )}
        >
          <Download className={iconSize} />
        </button>
      </div>

      {/* bottom-right add to task */}
      <button
        type="button"
        aria-label="add to task"
        onClick={onAdd}
        disabled={!isReady}
        className={cn(
          "pointer-events-auto absolute inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-1 text-[10.5px] font-medium text-foreground opacity-0 shadow ring-1 ring-border backdrop-blur transition-all hover:text-accent hover:ring-accent/60 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0",
          variant === "thumb" && "px-1.5",
        )}
        style={{ bottom: inset, right: inset }}
      >
        <Plus className="h-3 w-3" />
        {variant === "card" && <span>Add to task</span>}
      </button>
      <LayerEditDialog asset={asset} open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
