import { useEffect, useMemo, useRef, useState } from "react";
import { useSC } from "@/lib/sc/store";
import type { Asset } from "@/lib/sc/types";
import { User, Image as ImageIcon, Package, Film } from "lucide-react";

/**
 * CanvasView — 资产库视图（参考用户图二「资产库编辑」）。
 *
 * 只展示素材；不再渲染 stage / 流水线节点。
 * 同名角色的不同服装/姿态被收进一个浅色圆角分组卡片中横向排列，
 * 分组之间通过贝塞尔曲线连接其相关关系（角色 → 场景 / 片段 / 道具）。
 */

type GroupKind = "clip" | "character" | "wardrobe" | "prop" | "scene" | "other";

interface GroupSpec {
  key: string;
  kind: GroupKind;
  label: string;
  assets: Asset[];
}

const ASSET_W = 96;
const ASSET_H = 128;
const ASSET_GAP = 8;
const GROUP_PAD_X = 12;
const GROUP_PAD_TOP = 26;
const GROUP_PAD_BOTTOM = 12;
const GROUP_GAP_Y = 28;
const COL_GAP = 60;

function groupKindOf(a: Asset): GroupKind {
  if (a.kind === "video" || a.stageId === "life" || a.stageId === "details") return "clip";
  const id = (a.id || "").toUpperCase();
  if (id.startsWith("C")) return "character";
  if (id.startsWith("S")) return "scene";
  if (id.startsWith("W")) return "wardrobe";
  if (id.startsWith("P")) return "prop";
  if (a.stageId === "cast") return "character";
  if (a.stageId === "wardrobe") return "wardrobe";
  return "other";
}

function groupKeyOf(a: Asset, kind: GroupKind): string {
  // 同一角色名（caption）的多张资产归为一组 — 实现"同一角色不同服装"分组。
  const name = (a.caption ?? a.label ?? a.id).trim();
  if (kind === "clip") return `clip::${a.id}`; // 每个片段独立
  return `${kind}::${name}`;
}

function groupLabelOf(kind: GroupKind, sample: Asset, count: number): string {
  const base = (sample.caption ?? sample.label ?? sample.id).trim();
  if (kind === "clip") return sample.label || "片段";
  if (count > 1 && kind === "character") return base;
  return base;
}

function GroupHeaderIcon({ kind }: { kind: GroupKind }) {
  if (kind === "character") return <User className="h-3 w-3" />;
  if (kind === "scene") return <ImageIcon className="h-3 w-3" />;
  if (kind === "wardrobe") return <ImageIcon className="h-3 w-3" />;
  if (kind === "prop") return <Package className="h-3 w-3" />;
  if (kind === "clip") return <Film className="h-3 w-3" />;
  return <ImageIcon className="h-3 w-3" />;
}

/** Column layout: clips | characters | scenes — props/wardrobe stacked under characters. */
function buildLayout(groups: GroupSpec[]) {
  const columns: Record<"clip" | "character" | "wardrobe-prop" | "scene", GroupSpec[]> = {
    clip: [],
    character: [],
    "wardrobe-prop": [],
    scene: [],
  };
  for (const g of groups) {
    if (g.kind === "clip") columns.clip.push(g);
    else if (g.kind === "character") columns.character.push(g);
    else if (g.kind === "wardrobe" || g.kind === "prop") columns["wardrobe-prop"].push(g);
    else if (g.kind === "scene") columns.scene.push(g);
    else columns.character.push(g);
  }

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const colStarts = { clip: 0, character: 0, "wardrobe-prop": 0, scene: 0 };

  // Width per group depends on its asset count (max 3 per row).
  const groupWidth = (g: GroupSpec) => {
    const perRow = Math.min(g.assets.length, 3);
    return GROUP_PAD_X * 2 + perRow * ASSET_W + Math.max(0, perRow - 1) * ASSET_GAP;
  };
  const groupHeight = (g: GroupSpec) => {
    const rows = Math.ceil(g.assets.length / 3);
    return GROUP_PAD_TOP + GROUP_PAD_BOTTOM + rows * ASSET_H + Math.max(0, rows - 1) * ASSET_GAP + 16;
  };

  const colMaxWidth = (list: GroupSpec[]) =>
    list.reduce((m, g) => Math.max(m, groupWidth(g)), 0);

  const wClip = Math.max(180, colMaxWidth(columns.clip));
  const wChar = Math.max(240, colMaxWidth(columns.character));
  const wWP = Math.max(180, colMaxWidth(columns["wardrobe-prop"]));
  const wScene = Math.max(240, colMaxWidth(columns.scene));

  colStarts.clip = 0;
  colStarts.character = colStarts.clip + wClip + COL_GAP;
  colStarts["wardrobe-prop"] = colStarts.character + wChar + COL_GAP;
  colStarts.scene = colStarts["wardrobe-prop"] + wWP + COL_GAP;

  const place = (list: GroupSpec[], colX: number) => {
    let y = 0;
    for (const g of list) {
      const w = groupWidth(g);
      const h = groupHeight(g);
      positions.set(g.key, { x: colX, y, w, h });
      y += h + GROUP_GAP_Y;
    }
  };
  place(columns.clip, colStarts.clip);
  place(columns.character, colStarts.character);
  place(columns["wardrobe-prop"], colStarts["wardrobe-prop"]);
  place(columns.scene, colStarts.scene);

  const totalW = colStarts.scene + wScene + 40;
  const totalH = Math.max(
    400,
    ...[columns.clip, columns.character, columns["wardrobe-prop"], columns.scene].map((list) => {
      const last = list[list.length - 1];
      if (!last) return 0;
      const p = positions.get(last.key)!;
      return p.y + p.h;
    }),
  );

  return { positions, totalW, totalH, columns };
}

function buildEdges(groups: GroupSpec[]): Array<{ from: string; to: string }> {
  // 角色→场景：当 caption 在 scene caption 中出现则连一条曲线。
  // 角色→片段：所有 character 与所有 clip 连接（同 task 的关系）。
  // 角色→服装/道具：当服装/道具 caption 包含角色名时。
  const edges: Array<{ from: string; to: string }> = [];
  const chars = groups.filter((g) => g.kind === "character");
  const clips = groups.filter((g) => g.kind === "clip");
  const scenes = groups.filter((g) => g.kind === "scene");
  const wps = groups.filter((g) => g.kind === "wardrobe" || g.kind === "prop");

  for (const c of chars) {
    const cname = c.label.toLowerCase();
    for (const wp of wps) {
      const txt = `${wp.label} ${wp.assets.map((a) => a.caption ?? "").join(" ")}`.toLowerCase();
      if (cname && (txt.includes(cname) || wps.length === 1)) {
        edges.push({ from: c.key, to: wp.key });
      }
    }
    for (const s of scenes.slice(0, 2)) {
      edges.push({ from: c.key, to: s.key });
    }
    for (const clip of clips) {
      edges.push({ from: clip.key, to: c.key });
    }
  }
  return edges;
}

export function CanvasView() {
  const assets = useSC((s) => s.assets);
  const focusAsset = useSC((s) => s.focusAsset);
  const openPreview = useSC((s) => s.openPreview);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const groups = useMemo<GroupSpec[]>(() => {
    const map = new Map<string, GroupSpec>();
    for (const a of assets) {
      const kind = groupKindOf(a);
      const key = groupKeyOf(a, kind);
      let g = map.get(key);
      if (!g) {
        g = { key, kind, label: "", assets: [] };
        map.set(key, g);
      }
      g.assets.push(a);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      label: groupLabelOf(g.kind, g.assets[0], g.assets.length),
    }));
  }, [assets]);

  const { positions, totalW, totalH } = useMemo(() => buildLayout(groups), [groups]);
  const edges = useMemo(() => buildEdges(groups), [groups]);

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

      {groups.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
          暂无素材
        </div>
      )}

      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {/* Bezier connectors between groups */}
        <svg
          className="pointer-events-none absolute"
          style={{ width: totalW, height: totalH, overflow: "visible" }}
        >
          {edges.map((e, i) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w;
            const y1 = a.y + a.h / 2;
            const x2 = b.x;
            const y2 = b.y + b.h / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`${e.from}->${e.to}-${i}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                stroke="color-mix(in oklab, var(--accent) 35%, transparent)"
                strokeWidth={1.2}
                fill="none"
              />
            );
          })}
        </svg>

        {/* Group cards */}
        {groups.map((g) => {
          const p = positions.get(g.key);
          if (!p) return null;
          return (
            <div
              key={g.key}
              data-canvas-node
              className="absolute rounded-2xl border border-border bg-surface-2/60 shadow-sm"
              style={{ left: p.x, top: p.y, width: p.w, minHeight: p.h }}
            >
              <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-medium text-muted-foreground">
                <GroupHeaderIcon kind={g.kind} />
                <span className="truncate">{g.label}</span>
                {g.assets.length > 1 && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                    {g.assets.length}
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap px-3 pb-3 pt-2"
                style={{ gap: ASSET_GAP }}
              >
                {g.assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      focusAsset(a.id);
                      openPreview(a.id);
                    }}
                    className="group/asset overflow-hidden rounded-lg border border-border bg-background shadow-sm transition-transform hover:-translate-y-0.5"
                    style={{ width: ASSET_W }}
                    title={a.caption ?? a.label}
                  >
                    <div
                      className="relative bg-surface-2"
                      style={{ width: ASSET_W, height: ASSET_H - 18 }}
                    >
                      {a.url && a.kind === "image" ? (
                        <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                      ) : a.url && a.kind === "video" ? (
                        <video
                          src={a.url}
                          poster={a.poster}
                          className="h-full w-full bg-black object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                          {a.status}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-1.5 py-1">
                      <span className="font-mono text-[9px] text-accent">{a.label}</span>
                      <span className="truncate text-[9px] text-muted-foreground">
                        {a.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-surface px-2 py-1 font-mono text-[10px] text-muted-foreground shadow">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
