import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/lib/sc/types";

/**
 * Single inline tool / skill call line. Mirrors the streaming "using skill / calling tool"
 * presentation pattern: pulsing dot on the left, icon chip, label, live counter on the right.
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
  const verb = call.kind === "skill"
    ? (running ? "Using skill" : "Used skill")
    : (running ? "Calling tool" : "Called tool");

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-[11.5px] leading-none transition-colors",
        running
          ? "bg-accent/[0.06] border-accent/20"
          : "bg-background/40 hover:bg-background/60",
        "[animation:stream-fade_280ms_ease-out_both]",
      )}
    >
      <span
        className={cn(
          "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          running
            ? "bg-accent/15 text-accent ring-2 ring-accent/30"
            : "bg-surface-2 text-muted-foreground",
        )}
      >
        {running ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <Check className="h-2.5 w-2.5 text-status-ready" />
        )}
        {running && (
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
        )}
      </span>

      <Icon className={cn("h-3 w-3 shrink-0", running ? "text-accent" : "text-muted-foreground/80")} />

      <span className={cn("shrink-0 text-[10.5px] uppercase tracking-wider", running ? "text-accent/90" : "text-muted-foreground")}>
        {verb}
      </span>

      <span className={cn("min-w-0 truncate font-mono text-[11.5px]", running ? "text-foreground" : "text-foreground/80")}>
        {call.label}
        {running && <span className="thinking-dots ml-0.5 text-accent" />}
      </span>

      <span className="ml-auto shrink-0 rounded-md bg-surface-2/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        {elapsed.toFixed(1)}s
      </span>
    </div>
  );
}
