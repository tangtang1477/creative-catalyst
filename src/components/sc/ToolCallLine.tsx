import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/lib/sc/types";

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
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-background/40 px-2 py-1.5 text-[11.5px] font-mono leading-none",
        "[animation:stream-fade_280ms_ease-out_both]",
      )}
    >
      {running ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-status-ready" />
      )}
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        {call.kind === "skill" ? "Using skill" : "Calling tool"}
      </span>
      <span className="truncate text-foreground/85">{call.label}</span>
      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
        {elapsed.toFixed(1)}s
      </span>
    </div>
  );
}
