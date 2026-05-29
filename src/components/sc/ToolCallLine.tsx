import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/lib/sc/types";

/**
 * Inline flat sub-event row. Matches the conversational stream style:
 * small icon + "Using skill xxx" / "Calling tool xxx" + elapsed counter.
 * No border, no background — pure inline text.
 */
export function ToolCallLine({ call }: { call: ToolCall }) {
  const [, force] = useState(0);
  const running = call.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);

  const elapsed =
    call.status === "done"
      ? (call.durationMs ?? 0) / 1000
      : (Date.now() - call.startedAt) / 1000;

  const Icon = call.kind === "skill" ? Sparkles : Wrench;
  const verb =
    call.kind === "skill"
      ? running
        ? "Using skill"
        : "Used skill"
      : running
        ? "Calling tool"
        : "Called tool";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-0.5 text-[12px] leading-relaxed",
        "[animation:stream-fade_280ms_ease-out_both]",
      )}
    >
      {running ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-status-ready/80" />
      )}
      <Icon
        className={cn(
          "h-3 w-3 shrink-0",
          running ? "text-accent" : "text-muted-foreground/70",
        )}
      />
      <span
        className={cn(
          "shrink-0",
          running ? "text-foreground/80" : "text-muted-foreground",
        )}
      >
        {verb}
      </span>
      <span
        className={cn(
          "min-w-0 truncate font-mono text-[11.5px]",
          running ? "text-foreground" : "text-foreground/75",
        )}
      >
        {call.label}
        {running && <span className="thinking-dots ml-0.5 text-accent" />}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
        {elapsed.toFixed(1)}s
      </span>
    </div>
  );
}
