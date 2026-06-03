import { Check, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

const ITEMS: { key: string; label: string }[] = [
  { key: "char", label: "角色一致性" },
  { key: "scene", label: "场景一致性" },
  { key: "wardrobe", label: "服装/道具连贯" },
  { key: "story", label: "故事连贯性" },
  { key: "halluc", label: "幻觉/事实性" },
  { key: "compliance", label: "法务/合规" },
];

type ItemState = "pending" | "checking" | "pass" | "fail";

/**
 * 始终展示六项检测的结果；通过/未通过/等待中均可视。
 * - 阶段 running：上方进度条按 summary 行数推进
 * - 阶段 ready：根据 summary 中的 "✓" 与 thoughts 中的失败维度，
 *   每一项渲染为 pass（绿） / fail（红），即使无问题也保留勾选
 */
export function QCPanel() {
  const stage = useSC((s) => s.stages.qc);
  const total = ITEMS.length;
  const progress = Math.min(stage.summary.length, total);
  const isRunning = stage.status === "running" || stage.status === "recovering";
  const isDone = stage.status === "ready";

  // Parse failed dimensions from thoughts (issue body lines look like "A01 · 角色一致性（high）— ...")
  const failedDims = new Set<string>();
  for (const th of stage.thoughts) {
    for (const line of th.body) {
      for (const it of ITEMS) {
        if (line.includes(it.label)) failedDims.add(it.label);
      }
    }
  }

  const stateOf = (label: string, index: number): ItemState => {
    if (isDone) return failedDims.has(label) ? "fail" : "pass";
    if (isRunning && index < progress) return "pass";
    if (isRunning && index === progress) return "checking";
    return "pending";
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {ITEMS.map((it, i) => {
          const s = stateOf(it.label, i);
          return (
            <div
              key={it.key}
              className={cn(
                "flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5 text-[12px] transition-colors",
                s === "pass" && "bg-status-ready/12",
                s === "fail" && "bg-status-failed/15",
                s === "checking" && "bg-accent/10",
              )}
            >
              {s === "fail" ? (
                <ShieldAlert className="h-3.5 w-3.5 text-status-failed" />
              ) : s === "pass" ? (
                <Check className="h-3.5 w-3.5 text-status-ready" />
              ) : s === "checking" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <span className={cn(s === "pending" && "text-muted-foreground", s === "fail" && "text-status-failed")}>{it.label}</span>
              {s === "fail" && (
                <span className="ml-auto text-[10.5px] uppercase tracking-wider text-status-failed/85">未通过</span>
              )}
              {s === "pass" && (
                <span className="ml-auto text-[10.5px] uppercase tracking-wider text-status-ready/85">通过</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-[width] duration-500"
            style={{ width: `${(isDone ? total : progress) / total * 100}%` }}
          />
        </div>
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {isDone ? `${total - failedDims.size} / ${total} 通过` : `已检 ${progress} / ${total}`}
        </span>
      </div>
    </div>
  );
}
