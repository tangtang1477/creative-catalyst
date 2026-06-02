import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

/**
 * Lightbox preview for an asset. Supports versions via left/right arrows
 * and ESC to close.
 */
export function AssetPreviewDialog() {
  const id = useSC((s) => s.previewAssetId);
  const close = useSC((s) => s.closePreview);
  const asset = useSC((s) => s.assets.find((a) => a.id === id) ?? null);

  const versionUrls: string[] = [];
  if (asset) {
    asset.versions?.forEach((v) => versionUrls.push(v.url));
    if (asset.url) versionUrls.push(asset.url);
  }
  const [index, setIndex] = useState(versionUrls.length - 1);

  useEffect(() => {
    setIndex(versionUrls.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!asset) return null;
  const url = versionUrls[index] ?? asset.url ?? asset.poster;
  const total = Math.max(1, versionUrls.length);
  const isVideo = asset.kind === "video";

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="max-w-[96vw] gap-0 border-none bg-black/90 p-0 [&>button.absolute]:hidden"
      >
        <div className="relative flex items-center justify-center" style={{ minHeight: "75vh" }}>
          {url ? (
            isVideo ? (
              <video
                key={url}
                src={url}
                poster={asset.poster}
                controls
                autoPlay
                className="max-h-[90vh] max-w-[92vw] rounded-lg bg-black"
              />
            ) : (
              <img
                key={url}
                src={url}
                alt={asset.label}
                className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
              />
            )
          ) : (
            <div className="text-[13px] text-white/60">无可预览内容</div>
          )}

          {total > 1 && (
            <>
              <button
                type="button"
                aria-label="prev"
                onClick={() => setIndex((i) => (i - 1 + total) % total)}
                className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="next"
                onClick={() => setIndex((i) => (i + 1) % total)}
                className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[11.5px] text-white/90 backdrop-blur">
              <span className="font-mono font-semibold text-accent">{asset.label}</span>
              {asset.caption && <span className="opacity-80">· {asset.caption}</span>}
              {total > 1 && (
                <span className="rounded-full bg-white/15 px-1.5 font-mono text-[10px]">
                  v{index + 1}/{total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {url && (
                <a
                  href={url}
                  download={`${asset.label}.${isVideo ? "mp4" : "png"}`}
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/80",
                  )}
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
