import { type ReactNode } from "react";
import {
  Loader2,
  Check,
  AlertCircle,
  RotateCw,
  ChevronDown,
  Layers,
  Film,
  Image as ImageIcon,
  Wand2,
  Sparkles,
  Shirt,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { StageId, StageState } from "@/lib/sc/types";
import { STAGE_LABEL } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { ToolCallLine } from "./ToolCallLine";
import { ThinkingBlock } from "./ThinkingBlock";
import { SCButton } from "./Button";

const stageIcon: Record<StageId, typeof Layers> = {
  scene: Layers,
  structure: Film,
  wardrobe: Shirt,
  cast: Users,
  paint: ImageIcon,
  qc: ShieldCheck,
  life: Wand2,
  details: Sparkles,
};

const thinkingVerb: Record<StageId, string> = {
  scene: "Building the scene",
  structure: "Structuring the film",
  wardrobe: "Styling wardrobe & props",
  cast: "Casting characters & scenes",
  paint: "Painting the frame",
  qc: "Self-checking consistency",
  life: "Bringing it to life",
  details: "Merging final cut",
};

interface Props {
  id: StageId;
  state: StageState;
  children?: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
  keepChildrenWhenCollapsed?: boolean;
}

/** Sum of all completed toolCall durations + currently-running elapsed. */
function totalDuration(state: StageState): number {
  let sum = 0;
  for (const tc of state.toolCalls) {
    if (tc.status === "done" && tc.durationMs) sum += tc.durationMs;
    else if (tc.status === "running") sum += Math.max(0, Date.now() - tc.startedAt);
  }
  return sum;
}

function formatMs(ms: number): string {
  if (!ms) return "0.0s";
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
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
  const retryStage = useSC((s) => s.retryStage);
  const Icon = stageIcon[id];
  const expanded = state.expanded;
  const isRunning = state.status === "running" || state.status === "recovering";

  if (state.status === "pending") return null;

  const iconBoxClass =
    isRunning
      ? "bg-accent/20 text-accent"
      : state.status === "ready"
        ? "bg-accent text-background"
        : state.status === "failed"
          ? "bg-status-failed/20 text-status-failed"
          : "bg-surface-2 text-muted-foreground";

  const duration = totalDuration(state);

  return (
    <section
      data-stage-id={id}
      className="[animation:stream-fade_320ms_ease-out_both]"
    >
      <button
        type="button"
        onClick={() => toggleStage(id)}
        className="group flex w-full items-center gap-2 py-1.5 text-left focus:outline-none"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
            iconBoxClass,
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[13.5px] font-medium tracking-tight">
          {STAGE_LABEL[id]}
        </span>
        {state.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin text-status-generating" />
        )}
        {state.status === "recovering" && (
          <RotateCw className="h-3 w-3 animate-spin text-status-recovering" />
        )}
        {state.status === "ready" && (
          <Check className="h-3 w-3 text-status-ready" />
        )}
        {state.status === "failed" && (
          <AlertCircle className="h-3 w-3 text-status-failed" />
        )}
        {duration > 0 && (
          <span className="ml-auto mr-1 font-mono text-[11px] tabular-nums text-muted-foreground/70">
            {formatMs(duration)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/60 transition-all duration-200",
            duration > 0 ? "opacity-60" : "ml-auto opacity-0 group-hover:opacity-100",
            expanded && "rotate-180 opacity-100",
          )}
        />
      </button>

      {expanded ? (
        <div className="space-y-1 pl-7">
          {state.toolCalls.map((tc) => (
            <ToolCallLine key={tc.id} call={tc} />
          ))}
          {state.thoughts.map((th) => (
            <ThinkingBlock key={th.id} thought={th} />
          ))}
          {state.summary.map((s, i) => (
            <div
              key={`${i}-${s.slice(0, 8)}`}
              className="text-[12.5px] leading-relaxed text-muted-foreground [animation:stream-fade_320ms_ease-out_both]"
            >
              {s}
            </div>
          ))}
        </div>
      ) : (
        state.summary.length > 0 && (
          <div className="truncate pl-7 text-[12px] text-muted-foreground">
            {state.summary[state.summary.length - 1]}
          </div>
        )
      )}

      {(expanded || keepChildrenWhenCollapsed) && children && (
        <div className="mt-1.5 pl-7">{children}</div>
      )}

      {state.status === "failed" && state.errorMessage && (
        <div className="mt-2 ml-7 flex items-start gap-2 rounded-xl border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-[11.5px] text-foreground/85">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-failed" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-status-failed">该阶段失败</div>
            <div className="mt-0.5 line-clamp-3 text-muted-foreground">
              {state.errorMessage}
            </div>
          </div>
          <SCButton
            variant="chip"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[11px]"
            onClick={() => retryStage(id)}
          >
            <RotateCw className="h-3 w-3" />
            重做此步
          </SCButton>
        </div>
      )}

      {isRunning && (
        <div className="mt-1.5 ml-7 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-2.5 py-1 text-[11.5px] text-muted-foreground backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          <span className="font-mono">{thinkingVerb[id]}</span>
          <span className="thinking-dots text-accent" />
        </div>
      )}

      {expanded && details && (
        <details className="group mt-1.5 pl-7">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] text-muted-foreground/80 hover:text-foreground">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            {detailsLabel}
          </summary>
          <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {details}
          </div>
        </details>
      )}
    </section>
  );
}
