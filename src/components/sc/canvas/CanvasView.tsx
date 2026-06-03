import { useEffect, useRef, useState } from "react";
import { useSC } from "@/lib/sc/store";
import { STAGE_ORDER, STAGE_LABEL, type StageId } from "@/lib/sc/types";
import {
  Loader2,
  Check,
  Clock,
  AlertCircle,
  RotateCw,
  Layers,
  Film,
  Image as ImageIcon,
  Wand2,
  Sparkles,
  Shirt,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_ICON: Record<StageId, typeof Layers> = {
  scene: Layers,
  structure: Film,
  wardrobe: Shirt,
  cast: Users,
  paint: ImageIcon,
  qc: ShieldCheck,
  life: Wand2,
  details: Sparkles,
};

const NODE_W = 220;
const NODE_H = 110;
const COL_GAP = 90;
const ASSET_SIZE = 96;

/** Compute layout for stages + assets on the canvas. */
function useLayout() {
  const { stages, assets } = useSC();
  const visibleStages = STAGE_ORDER.filter((id) => stages[id].status !== "pending");

  const stagePos: Record<string, { x: number; y: number }> = {};
  visibleStages.forEach((id, i) => {
    stagePos[id] = {
      x: i * (NODE_W + COL_GAP),
      y: 0,
    };
  });

  const assetPos: Record<string, { x: number; y: number; stageId: StageId }> = {};
  const byStage = new Map<StageId, typeof assets>();
  assets.forEach((a) => {
    const s = (a.stageId ?? "paint") as StageId;
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s)!.push(a);
  });
  byStage.forEach((list, sid) => {
    const sp = stagePos[sid];
    if (!sp) return;
    list.forEach((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      assetPos[a.id] = {
        x: sp.x + col * (ASSET_SIZE + 16) + (NODE_W - 2 * ASSET_SIZE - 16) / 2,
        y: NODE_H + 60 + row * (ASSET_SIZE + 50),
        stageId: sid,
      };
    });
  });

  return { visibleStages, stagePos, assetPos };
}

export function CanvasView() {
  const { stages, assets } = useSC();
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 80, y: 100 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const { visibleStages, stagePos, assetPos } = useLayout();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(1.6, Math.max(0.4, z * (e.deltaY > 0 ? 0.94 : 1.06))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden bg-background"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-canvas-node]")) return;
        dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }}
      onMouseMove={(e) => {
        if (!dragging.current) return;
        setPan({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
      }}
      onMouseUp={() => (dragging.current = null)}
      onMouseLeave={() => (dragging.current = null)}
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
    >
      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* edges */}
        <svg
          className="pointer-events-none absolute"
          style={{
            width: visibleStages.length * (NODE_W + COL_GAP),
            height: 800,
            overflow: "visible",
          }}
        >
          {/* stage→stage */}
          {visibleStages.slice(0, -1).map((from, i) => {
            const to = visibleStages[i + 1];
            const a = stagePos[from];
            const b = stagePos[to];
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`e-${from}-${to}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                stroke="color-mix(in oklab, var(--accent) 50%, transparent)"
                strokeWidth={1.2}
                fill="none"
              />
            );
          })}
          {/* stage→asset */}
          {assets.map((a) => {
            const ap = assetPos[a.id];
            if (!ap) return null;
            const sp = stagePos[ap.stageId];
            if (!sp) return null;
            return (
              <path
                key={`ea-${a.id}`}
                d={`M ${sp.x + NODE_W / 2} ${sp.y + NODE_H} L ${ap.x + ASSET_SIZE / 2} ${ap.y}`}
                stroke="color-mix(in oklab, var(--accent) 28%, transparent)"
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="none"
              />
            );
          })}
        </svg>

        {/* stage nodes */}
        {visibleStages.map((id) => {
          const st = stages[id];
          const pos = stagePos[id];
          const Icon = STAGE_ICON[id];
          let StatusIcon = Clock;
          let statusClass = "text-muted-foreground";
          let spin = false;
          if (st.status === "running") { StatusIcon = Loader2; statusClass = "text-status-generating"; spin = true; }
          else if (st.status === "ready") { StatusIcon = Check; statusClass = "text-status-ready"; }
          else if (st.status === "recovering") { StatusIcon = RotateCw; statusClass = "text-status-recovering"; spin = true; }
          else if (st.status === "failed") { StatusIcon = AlertCircle; statusClass = "text-status-failed"; }

          return (
            <div
              key={id}
              data-canvas-node
              className="absolute rounded-xl border border-border bg-surface p-3 shadow-lg"
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_W,
                minHeight: NODE_H,
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="flex-1 truncate text-[12.5px] font-medium">
                  {STAGE_LABEL[id]}
                </span>
                <StatusIcon className={cn("h-3.5 w-3.5", statusClass, spin && "animate-spin")} />
              </div>
              {st.toolCalls.length > 0 && (
                <div className="mt-2 text-[10.5px] font-mono text-muted-foreground">
                  {st.toolCalls.slice(-2).map((tc) => (
                    <div key={tc.id} className="truncate">
                      · {tc.label}
                    </div>
                  ))}
                </div>
              )}
              {st.summary.length > 0 && (() => {
                const last = st.summary[st.summary.length - 1];
                const text = typeof last === "string" ? last : last.text;
                return (
                  <div className="mt-1 truncate text-[10.5px] text-muted-foreground">
                    · {text}
                  </div>
                );
              })()}

            </div>
          );
        })}

        {/* asset nodes */}
        {assets.map((a) => {
          const pos = assetPos[a.id];
          if (!pos) return null;
          return (
            <div
              key={a.id}
              data-canvas-node
              className="absolute overflow-hidden rounded-lg border border-border bg-surface-2 shadow-md"
              style={{ left: pos.x, top: pos.y, width: ASSET_SIZE }}
              title={a.caption ?? a.label}
            >
              <div className="relative" style={{ aspectRatio: a.kind === "image" ? "9/16" : "16/9" }}>
                {a.url && a.kind === "image" ? (
                  <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                ) : a.url && a.kind === "video" ? (
                  <video src={a.url} poster={a.poster} className="h-full w-full bg-black object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                    {a.status}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-1 py-0.5">
                <span className="font-mono text-[9px] text-accent">{a.label}</span>
                <span className="truncate text-[9px] text-muted-foreground">{a.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* zoom indicator */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-surface px-2 py-1 font-mono text-[10px] text-muted-foreground shadow">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
