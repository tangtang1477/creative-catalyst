import { useMemo, useState } from "react";
import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";
import { Image as ImageIcon, Film, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";
import { Collapse } from "./Collapse";

export function MediaRail() {
  const { assets, phase, rail, setRailOpen } = useSC();
  const [imgOpen, setImgOpen] = useState(true);
  const [vidOpen, setVidOpen] = useState(true);

  const images = useMemo(() => assets.filter((a) => a.kind === "image"), [assets]);
  const videos = useMemo(() => assets.filter((a) => a.kind === "video"), [assets]);

  const hidden = phase === "empty" || phase === "intake" || phase === "thinking";

  return (
    <div
      data-open={rail.open && !hidden}
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out",
        rail.open && !hidden ? "w-[340px]" : "w-0",
      )}
    >
      <aside
        className={cn(
          "flex h-full w-[340px] flex-col border-l border-border bg-surface",
          "transition-transform duration-300 ease-out",
          rail.open && !hidden ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1.5 text-foreground/85">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="font-medium">Assets</span>
            <span className="text-muted-foreground">· {assets.length}</span>
          </div>
          <SCButton
            variant="icon"
            size="icon"
            className="h-7 w-7"
            aria-label="close"
            onClick={() => setRailOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </SCButton>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
              等待生成…
            </div>
          ) : (
            <div className="space-y-4">
              {images.length > 0 && (
                <Group
                  title="Images"
                  count={images.length}
                  Icon={ImageIcon}
                  open={imgOpen}
                  onToggle={() => setImgOpen((v) => !v)}
                >
                  {images.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      compact
                      highlighted={rail.flashId === a.id}
                    />
                  ))}
                </Group>
              )}
              {videos.length > 0 && (
                <Group
                  title="Videos"
                  count={videos.length}
                  Icon={Film}
                  open={vidOpen}
                  onToggle={() => setVidOpen((v) => !v)}
                >
                  {videos.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      compact
                      highlighted={rail.flashId === a.id}
                    />
                  ))}
                </Group>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
          {images.length} image · {videos.length} video
        </div>
      </aside>
    </div>
  );
}

function Group({
  title,
  count,
  Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  Icon: typeof ImageIcon;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center justify-between gap-2 rounded-md bg-surface/95 px-1 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          {title} ({count})
        </span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform duration-300", open && "rotate-180")}
        />
      </button>
      <Collapse open={open}>
        <div className="mt-2 space-y-3">{children}</div>
      </Collapse>
    </div>
  );
}
