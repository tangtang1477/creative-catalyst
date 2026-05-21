import { useState, type ReactNode } from "react";
import {
  Loader2,
  Check,
  Clock,
  AlertCircle,
  RotateCw,
  ChevronDown,
  Layers,
  Film,
  Image as ImageIcon,
  Wand2,
  Sparkles,
} from "lucide-react";
import type { StageId, StageState } from "@/lib/sc/types";
import { STAGE_LABEL } from "@/lib/sc/types";
import { cn } from "@/lib/utils";

const stageIcon: Record<StageId, typeof Layers> = {
  scene: Layers,
  structure: Film,
  paint: ImageIcon,
  life: Wand2,
  details: Sparkles,
};

interface Props {
  id: StageId;
  state: StageState;
  children?: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
}

export function StageRow({
  id,
  state,
  children,
  details,
  detailsLabel = "Prompt details",
}: Props) {
  const [open, setOpen] = useState(false);
  const Icon = stageIcon[id];

  let StatusIcon = Clock;
  let statusClass = "text-muted-foreground";
  let spin = false;
  if (state.status === "running") {
    StatusIcon = Loader2;
    statusClass = "text-status-generating";
    spin = true;
  } else if (state.status === "ready") {
    StatusIcon = Check;
    statusClass = "text-status-ready";
  } else if (state.status === "recovering") {
    StatusIcon = RotateCw;
    statusClass = "text-status-recovering";
    spin = true;
  } else if (state.status === "failed") {
    StatusIcon = AlertCircle;
    statusClass = "text-status-failed";
  }

  if (state.status === "pending") return null;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium tracking-tight">
              {STAGE_LABEL[id]}
            </span>
            <StatusIcon className={cn("h-3.5 w-3.5", statusClass, spin && "animate-spin")} />
          </div>
          {state.summary.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-muted-foreground">
              {state.summary.map((s, i) => (
                <li key={i} className="leading-snug">
                  · {s}
                </li>
              ))}
            </ul>
          )}
          {children && <div className="mt-3">{children}</div>}
          {details && (
            <div className="mt-2">
              <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98]"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    open && "rotate-180",
                  )}
                />
                {detailsLabel}
              </button>
              {open && (
                <div className="mt-2 rounded-md border border-border bg-background/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {details}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
