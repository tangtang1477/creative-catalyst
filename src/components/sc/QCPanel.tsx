import { Check, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "char", label: "角色一致性" },
  { key: "scene", label: "场景一致性" },
  { key: "wardrobe", label: "服装/道具连贯" },
  { key: "story", label: "故事连贯性" },
  { key: "halluc", label: "幻觉/事实性" },
  { key: "compliance", label: "法务/合规" },
];

/** Live QC checklist — count derived from stage summary progress. */
export function QCPanel() {
  const stage = useSC((s) => s.stages.qc);
  const progress = Math.min(stage.summary.length, ITEMS.length);
  const issueFound = stage.summary.some((l) => l.includes("问题"));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {ITEMS.map((it, i) => {
          const done = i < progress;
          const flagged =
            issueFound && it.key === "char" && stage.status !== "ready";
          return (
            <div
              key={it.key}
              className={cn(
                "flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5 text-[12px] transition-colors",
                done && "bg-status-ready/12",
                flagged && "bg-status-failed/15",
              )}
            >
              {flagged ? (
                <ShieldAlert className="h-3.5 w-3.5 text-status-failed" />
              ) : done ? (
                <Check className="h-3.5 w-3.5 text-status-ready" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <span className={cn(!done && "text-muted-foreground")}>
                {it.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${(progress / ITEMS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
