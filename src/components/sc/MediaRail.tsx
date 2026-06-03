import { useEffect, useMemo, useRef, useState } from "react";
import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";
import { AssetThumbCard } from "./AssetThumbCard";
import {
  Image as ImageIcon,
  Film,
  ChevronDown,
  X,
  CheckSquare,
  Sparkles,
  LayoutGrid,
  List,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";
import { Collapse } from "./Collapse";
import { BatchEditDialog } from "./BatchEditDialog";
import { VoiceLibraryGrid } from "./VoiceLibraryGrid";

type ViewMode = "grid" | "list";
type Filter = "all" | "image" | "video" | "audio";

const FILTER_LABEL: Record<Filter, string> = {
  all: "全部",
  image: "图片",
  video: "视频",
  audio: "音频",
};

const WIDTH_KEY = "sc.rail.width";
const VIEW_KEY = "sc.rail.view";
const MIN_W = 360;
const MAX_W = 680;
const DEFAULT_W = 480;

const loadWidth = () => {
  if (typeof window === "undefined") return DEFAULT_W;
  const v = Number(window.localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(v) && v >= MIN_W && v <= MAX_W ? v : DEFAULT_W;
};
const loadView = (): ViewMode => {
  if (typeof window === "undefined") return "grid";
  return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
};

export function MediaRail() {
  const { assets, phase, rail, setRailOpen, taskKind, selection, toggleSelect, clearSelection, addAttachment } = useSC();
  const [imgOpen, setImgOpen] = useState(true);
  // (Single-group list view; vidOpen retained as no-op for backwards compat)
  const [filter, setFilter] = useState<Filter>("all");
  const [audioTab, setAudioTab] = useState<"task" | "library">("task");
  const [batchOpen, setBatchOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(loadView);
  const [width, setWidth] = useState<number>(loadWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  // Selection auto-activates whenever at least one asset is selected.
  const multi = selection.length > 0;

  // persist
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);
  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // dragging left grows the rail (rail is on the right edge)
      const next = Math.max(MIN_W, Math.min(MAX_W, d.startW + (d.startX - ev.clientX)));
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const images = useMemo(() => assets.filter((a) => a.kind === "image"), [assets]);
  const videos = useMemo(() => assets.filter((a) => a.kind === "video"), [assets]);
  const audios = useMemo(
    () =>
      assets.filter(
        (a) =>
          (a.kind as string) === "audio" ||
          /\.(mp3|wav|m4a|ogg)$/i.test(a.url ?? ""),
      ),
    [assets],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "image":
        return images;
      case "video":
        return videos;
      case "audio":
        return audios;
      default:
        return assets;
    }
  }, [assets, filter, images, videos, audios]);

  const episodes = useMemo(() => {
    if (taskKind !== "series") return [];
    const map = new Map<number, typeof assets>();
    for (const a of visible) {
      const ep = a.episode ?? 0;
      if (!map.has(ep)) map.set(ep, []);
      map.get(ep)!.push(a);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible, taskKind]);

  const hidden = phase === "empty" || phase === "intake" || phase === "thinking";
  const open = rail.open && !hidden;

  return (
    <div
      data-open={open}
      className={cn(
        "relative h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out",
      )}
      style={{ width: open ? width : 0 }}
    >
      {/* Drag handle */}
      {open && (
        <button
          type="button"
          onMouseDown={onDragStart}
          aria-label="resize gallery"
          className="absolute left-0 top-0 z-20 flex h-full w-1.5 cursor-col-resize items-center justify-center hover:bg-accent/30"
        >
          <GripVertical className="h-4 w-4 text-transparent transition-colors hover:text-accent" />
        </button>
      )}

      <aside
        className={cn(
          "flex h-full flex-col border-l border-border bg-surface",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: width }}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1.5 text-foreground/85">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="font-medium">Assets</span>
            <span className="text-muted-foreground">· {assets.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* View toggle */}
            <div className="mr-1 flex items-center gap-0.5 rounded-md bg-surface-2/60 p-0.5">
              <button
                type="button"
                aria-label="grid view"
                onClick={() => setView("grid")}
                className={cn(
                  "rounded p-1 transition-colors",
                  view === "grid" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="list view"
                onClick={() => setView("list")}
                className={cn(
                  "rounded p-1 transition-colors",
                  view === "list" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
            <SCButton
              variant="icon"
              size="icon"
              className={cn("h-7 w-7", multi && "bg-accent/15 text-accent")}
              aria-label="select all"
              title={multi ? "清空选择" : "全选当前过滤集"}
              onClick={() => {
                if (multi) {
                  clearSelection();
                } else {
                  visible.forEach((a) => {
                    if (!selection.includes(a.id)) toggleSelect(a.id);
                  });
                }
              }}
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </SCButton>
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
        </div>

        {/* Filter chips */}
        {assets.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-1.5">
            {(["all", "image", "video", "audio"] as const).map((f) => {
              const count =
                f === "all"
                  ? assets.length
                  : f === "image"
                    ? images.length
                    : f === "video"
                      ? videos.length
                      : audios.length;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors",
                    filter === f
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {FILTER_LABEL[f]}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-mono",
                      filter === f ? "bg-accent-foreground/15" : "bg-surface-2",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}


        {/* (Inline toolbar removed — floating bar below replaces it) */}

        {/* Audio tabs (segmented) */}
        {filter === "audio" && (
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
            {(
              [
                { id: "task" as const, label: "任务音频" },
                { id: "library" as const, label: "音色库" },
              ]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setAudioTab(t.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  audioTab === t.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {filter === "audio" && audioTab === "library" ? (
            <VoiceLibraryGrid />
          ) : (
            <>
          {assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
              等待生成…
            </div>
          ) : taskKind === "series" ? (
            <div className="space-y-4">
              {episodes.map(([ep, list]) =>
                view === "grid" ? (
                  <EpisodeGrid
                    key={ep}
                    episode={ep}
                    list={list}
                    rail={rail}
                    selectable={multi}
                    selection={selection}
                    onToggle={toggleSelect}
                  />
                ) : (
                  <EpisodeList
                    key={ep}
                    episode={ep}
                    list={list}
                    rail={rail}
                    selectable={multi}
                    selection={selection}
                    onToggle={toggleSelect}
                  />
                ),
              )}
            </div>
          ) : view === "grid" ? (
            <div className="space-y-4">
              <Group
                title="All assets"
                count={visible.length}
                Icon={ImageIcon}
                open={imgOpen}
                onToggle={() => setImgOpen((v) => !v)}
              >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
                  {visible.map((a) => (
                    <AssetThumbCard
                      key={a.id}
                      asset={a}
                      selectable={multi}
                      selected={selection.includes(a.id)}
                      onToggle={toggleSelect}
                      highlighted={rail.flashId === a.id}
                    />
                  ))}
                </div>
              </Group>
            </div>
          ) : (
            <div className="space-y-4">
              <Group
                title={FILTER_LABEL[filter]}
                count={visible.length}
                Icon={filter === "video" ? Film : ImageIcon}
                open={imgOpen}
                onToggle={() => setImgOpen((v) => !v)}
              >
                <div className="space-y-2">
                  {visible.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      compact
                      highlighted={rail.flashId === a.id}
                      selectable={multi}
                      selected={selection.includes(a.id)}
                      onToggle={toggleSelect}
                    />
                  ))}
                </div>
              </Group>
            </div>
          )}

        </div>

        <div className="shrink-0 border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
          {images.length} image · {videos.length} video · {width}px
        </div>

        {/* Floating selection action bar */}
        {multi && (
          <div className="pointer-events-none absolute inset-x-3 bottom-12 z-30 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-2 py-1.5 shadow-2xl backdrop-blur [animation:stream-fade_240ms_ease-out_both]">
              <span className="px-2 text-[11px] text-muted-foreground">
                已选 <span className="font-semibold text-accent">{selection.length}</span>
              </span>
              <SCButton
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => {
                  const ids = new Set(selection);
                  assets
                    .filter((a) => ids.has(a.id) && (a.url || a.poster))
                    .forEach((a) =>
                      addAttachment({
                        id: Math.random().toString(36).slice(2, 9),
                        kind: a.kind,
                        name: a.label,
                        url: a.url ?? "",
                        thumb: a.kind === "image" ? a.url : a.poster,
                        source: "asset",
                        ref: a.label,
                      }),
                    );
                  clearSelection();
                }}
              >
                <Sparkles className="h-3 w-3" />
                Add to task
              </SCButton>
              <SCButton
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={selection.length < 2}
                onClick={() => setBatchOpen(true)}
              >
                批量修改
              </SCButton>
              <button
                onClick={clearSelection}
                aria-label="clear selection"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <BatchEditDialog open={batchOpen} onOpenChange={setBatchOpen} />
    </div>
  );
}

function EpisodeGrid({
  episode,
  list,
  rail,
  selectable,
  selection,
  onToggle,
}: {
  episode: number;
  list: import("@/lib/sc/types").Asset[];
  rail: { flashId?: string };
  selectable: boolean;
  selection: string[];
  onToggle: (id: string) => void;
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
          <span className="font-mono text-[10px] text-muted-foreground">· {list.length}</span>
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
          {list.map((a) => (
            <AssetThumbCard
              key={a.id}
              asset={a}
              highlighted={rail.flashId === a.id}
              selectable={selectable}
              selected={selection.includes(a.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

function EpisodeList({
  episode,
  list,
  rail,
  selectable,
  selection,
  onToggle,
}: {
  episode: number;
  list: import("@/lib/sc/types").Asset[];
  rail: { flashId?: string };
  selectable: boolean;
  selection: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const scenes = new Map<number, typeof list>();
  for (const a of list) {
    const sc = a.scene ?? 0;
    if (!scenes.has(sc)) scenes.set(sc, []);
    scenes.get(sc)!.push(a);
  }
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
          {[...scenes.entries()].sort((a, b) => a[0] - b[0]).map(([sc, items]) => (
            <div key={sc}>
              <div className="mb-1 px-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Scene {sc.toString().padStart(2, "0")}
              </div>
              <div className="space-y-2">
                {items.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    compact
                    highlighted={rail.flashId === a.id}
                    selectable={selectable}
                    selected={selection.includes(a.id)}
                    onToggle={onToggle}
                  />
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
        <div className="mt-2">{children}</div>
      </Collapse>
    </div>
  );
}
