import { type ReactNode } from "react";
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
import { useSC } from "@/lib/sc/store";
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
  /** When true, children (media) stay visible even when stage is collapsed. */
  keepChildrenWhenCollapsed?: boolean;
}

export function StageRow({
  id,
  state,
  children,
  details,
  detailsLabel = "Prompt details",
  keepChildrenWhenCollapsed = false,
}: Props) {
  const { toggleStage } = useSC();
  const Icon = stageIcon[id];
  const expanded = state.expanded;

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
    <div
      data-stage-id={id}
      className="rounded-2xl border border-border bg-surface transition-shadow"
    >
      <button
        type="button"
        onClick={() => toggleStage(id)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left focus:outline-none focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium tracking-tight">
              {STAGE_LABEL[id]}
            </span>
            <StatusIcon
              className={cn("h-3.5 w-3.5", statusClass, spin && "animate-spin")}
            />
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
          {expanded && state.summary.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-muted-foreground">
              {state.summary.map((s, i) => (
                <li key={i} className="leading-snug">
                  · {s}
                </li>
              ))}
            </ul>
          )}
          {!expanded && state.summary.length > 0 && (
            <div className="mt-1 truncate text-[12px] text-muted-foreground">
              · {state.summary[0]}
            </div>
          )}
        </div>
      </button>

      {(expanded || keepChildrenWhenCollapsed) && children && (
        <div className="px-3.5 pb-3">{children}</div>
      )}

      {expanded && details && (
        <div className="px-3.5 pb-3">
          <details className="group rounded-xl border border-border bg-background/40 open:bg-background/60">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              {detailsLabel}
            </summary>
            <div className="px-3 pb-2.5 pt-1 text-[12px] leading-relaxed text-muted-foreground">
              {details}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
