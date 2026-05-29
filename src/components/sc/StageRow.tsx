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
} from "lucide-react";
import type { StageId, StageState } from "@/lib/sc/types";
import { STAGE_LABEL } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { ToolCallLine } from "./ToolCallLine";
import { ThinkingBlock } from "./ThinkingBlock";

const stageIcon: Record<StageId, typeof Layers> = {
  scene: Layers,
  structure: Film,
  wardrobe: Shirt,
  paint: ImageIcon,
  qc: ShieldCheck,
  life: Wand2,
  details: Sparkles,
};

interface Props {
  id: StageId;
  state: StageState;
  children?: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
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

  if (state.status === "pending") return null;

  const iconBoxClass =
    state.status === "running" || state.status === "recovering"
      ? "bg-accent/20 text-accent"
      : state.status === "ready"
        ? "bg-accent text-background"
        : state.status === "failed"
          ? "bg-status-failed/20 text-status-failed"
          : "bg-surface-2 text-muted-foreground";

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
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition-all duration-200 group-hover:opacity-100",
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
