import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

/**
 * Lightbox preview for an asset. Left/right arrows switch between sibling
 * assets (same stage + kind, e.g. K01 → K02). A separate version pill in
 * the top-left lets the user jump between historic versions of one asset.
 */
export function AssetPreviewDialog() {
  const id = useSC((s) => s.previewAssetId);
  const close = useSC((s) => s.closePreview);
  const openPreview = useSC((s) => s.openPreview);
  const assets = useSC((s) => s.assets);
  const asset = useMemo(() => assets.find((a) => a.id === id) ?? null, [assets, id]);

  // Sibling list: same stageId + same kind, in store order.
  const siblings = useMemo(() => {
    if (!asset) return [] as string[];
    return assets
      .filter((a) => a.stageId === asset.stageId && a.kind === asset.kind)
      .map((a) => a.id);
  }, [assets, asset]);
  const sibIndex = asset ? siblings.indexOf(asset.id) : -1;
  const sibTotal = siblings.length;

  // Version list for the current asset (older versions + current url).
  const versionUrls: string[] = [];
  if (asset) {
    asset.versions?.forEach((v) => versionUrls.push(v.url));
    if (asset.url) versionUrls.push(asset.url);
  }
  const [vIndex, setVIndex] = useState(versionUrls.length - 1);

  useEffect(() => {
    setVIndex(versionUrls.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const goPrev = () => {
    if (sibTotal <= 1 || sibIndex < 0) return;
    openPreview(siblings[(sibIndex - 1 + sibTotal) % sibTotal]);
  };
  const goNext = () => {
    if (sibTotal <= 1 || sibIndex < 0) return;
    openPreview(siblings[(sibIndex + 1) % sibTotal]);
  };

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sibIndex, sibTotal]);

  if (!asset) return null;
  const url = versionUrls[vIndex] ?? asset.url ?? asset.poster;
  const vTotal = Math.max(1, versionUrls.length);
  const isVideo = asset.kind === "video";

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-[96vw] gap-0 border-none bg-black/90 p-0 [&>button.absolute]:hidden">
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

          {sibTotal > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={goPrev}
                className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={goNext}
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
              {sibTotal > 1 && sibIndex >= 0 && (
                <span className="rounded-full bg-white/15 px-1.5 font-mono text-[10px]">
                  {sibIndex + 1}/{sibTotal}
                </span>
              )}
              {vTotal > 1 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-1 py-0.5">
                  <button
                    type="button"
                    aria-label="上一版本"
                    onClick={() => setVIndex((i) => (i - 1 + vTotal) % vTotal)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="font-mono text-[10px]">v{vIndex + 1}/{vTotal}</span>
                  <button
                    type="button"
                    aria-label="下一版本"
                    onClick={() => setVIndex((i) => (i + 1) % vTotal)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
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
