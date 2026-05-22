import { useMemo, useState } from "react";
import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";
import { Image as ImageIcon, Film, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";
import { Collapse } from "./Collapse";

export function MediaRail() {
  const { assets, phase, rail, setRailOpen, taskKind } = useSC();
  const [imgOpen, setImgOpen] = useState(true);
  const [vidOpen, setVidOpen] = useState(true);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  const images = useMemo(() => assets.filter((a) => a.kind === "image"), [assets]);
  const videos = useMemo(() => assets.filter((a) => a.kind === "video"), [assets]);

  const episodes = useMemo(() => {
    if (taskKind !== "series") return [];
    const map = new Map<number, typeof assets>();
    for (const a of assets) {
      const ep = a.episode ?? 0;
      if (!map.has(ep)) map.set(ep, []);
      map.get(ep)!.push(a);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [assets, taskKind]);

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
          ) : taskKind === "series" ? (
            <div className="space-y-4">
              {/* sticky filter bar */}
              <div className="sticky top-0 z-10 -mx-3 mb-2 flex items-center gap-1 border-b border-border bg-surface/95 px-3 py-1.5 backdrop-blur">
                {(["all", "image", "video"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors",
                      filter === f
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    {f}
                  </button>
                ))}
                <span className="ml-auto text-[10.5px] text-muted-foreground">
                  {episodes.length} EP
                </span>
              </div>

              {episodes.map(([ep, list]) => {
                const filtered = list.filter((a) =>
                  filter === "all" ? true : a.kind === filter,
                );
                const scenes = new Map<number, typeof list>();
                for (const a of filtered) {
                  const sc = a.scene ?? 0;
                  if (!scenes.has(sc)) scenes.set(sc, []);
                  scenes.get(sc)!.push(a);
                }
                return (
                  <EpisodeBlock
                    key={ep}
                    episode={ep}
                    scenes={[...scenes.entries()].sort((a, b) => a[0] - b[0])}
                    rail={rail}
                  />
                );
              })}
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

function EpisodeBlock({
  episode,
  scenes,
  rail,
}: {
  episode: number;
  scenes: [number, import("@/lib/sc/types").Asset[]][];
  rail: { flashId?: string };
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md bg-surface-2/60 px-2 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-foreground hover:bg-surface-2"
      >
        <span className="flex items-center gap-1.5">
          <Film className="h-3 w-3 text-accent" />
          Episode {episode}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <div className="mt-2 space-y-3">
          {scenes.map(([sc, list]) => (
            <div key={sc}>
              <div className="mb-1 px-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Scene {sc.toString().padStart(2, "0")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {list.map((a) => (
                  <AssetCard key={a.id} asset={a} compact highlighted={rail.flashId === a.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Collapse>
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
