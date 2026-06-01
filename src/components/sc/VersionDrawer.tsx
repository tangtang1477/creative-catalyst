import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Asset } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { Download, Check } from "lucide-react";

interface Props {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  init: "首次生成",
  "qc-fix": "QC 一致性修正",
  "manual-retry": "手动重试",
  "batch-edit": "批量修改",
  "manual-edit": "手动编辑",
  "manual-revert": "切回旧版",
};

const relTime = (ts: number) => {
  const d = Math.max(0, Date.now() - ts);
  if (d < 60_000) return "刚刚";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleString();
};

export function VersionDrawer({ asset, open, onOpenChange }: Props) {
  const setActiveVersion = useSC((s) => s.setActiveVersion);

  // Versions list = current + history. Current shown first as "v{N}".
  const items = useMemo(() => {
    if (!asset) return [];
    const versions = asset.versions ?? [];
    const total = versions.length + 1;
    const current = {
      url: asset.url ?? "",
      createdAt: Date.now(),
      source: "current" as const,
      note: undefined as string | undefined,
      isCurrent: true,
      versionLabel: `v${total}`,
      index: -1,
    };
    const history = versions.map((v, i) => ({
      ...v,
      isCurrent: false,
      versionLabel: `v${i + 1}`,
      index: i,
    }));
    return [current, ...history].reverse();
  }, [asset]);

  if (!asset) return null;
  const thumb = (url?: string) => (asset.kind === "image" ? url : asset.poster ?? url);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[14px]">
            <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">
              {asset.label}
            </span>
            版本历史
          </SheetTitle>
          <SheetDescription className="text-[11.5px]">
            共 {items.length} 个版本 · 点击任一旧版本可切换为当前
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {items.map((it) => (
            <div
              key={`${it.versionLabel}-${it.url}`}
              className={cn(
                "group flex items-start gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors",
                it.isCurrent && "border-accent/50 bg-accent/5",
              )}
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {thumb(it.url) ? (
                  <img
                    src={thumb(it.url)}
                    alt={it.versionLabel}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {it.versionLabel}
                  </span>
                  {it.isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Check className="h-2.5 w-2.5" /> 当前
                    </span>
                  )}
                  <span className="text-[10.5px] text-muted-foreground">
                    {SOURCE_LABEL[it.source] ?? it.source}
                  </span>
                </div>
                <div className="text-[10.5px] text-muted-foreground">{relTime(it.createdAt)}</div>
                {it.note && <div className="text-[11px] text-foreground/80">{it.note}</div>}
                <div className="flex items-center gap-2 pt-1">
                  {!it.isCurrent && (
                    <button
                      type="button"
                      onClick={() => setActiveVersion(asset.id, it.index)}
                      className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-medium text-accent-foreground hover:bg-accent/90"
                    >
                      切换为当前
                    </button>
                  )}
                  {it.url && (
                    <a
                      href={it.url}
                      download={`${asset.label}-${it.versionLabel}.${asset.kind === "video" ? "mp4" : "png"}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                    >
                      <Download className="h-3 w-3" /> 下载
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
