import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, Wrench, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Collapse } from "./Collapse";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import type { ChatToolCall } from "@/lib/sc/types";

interface ChatAgentMessageProps {
  id: string;
  text: string;
  streaming?: boolean;
  toolCalls?: ChatToolCall[];
  actions?: Array<
    | { label: string; kind: "retry-stage"; stageId: import("@/lib/sc/types").StageId }
    | { label: string; kind: "rerun-all" }
  >;
}

export function ChatAgentMessage({
  text,
  streaming,
  toolCalls,
  actions,
}: ChatAgentMessageProps) {
  const retryStage = useSC((s) => s.retryStage);
  const submit = useSC((s) => s.submit);
  const briefPrompt = useSC((s) => s.brief?.prompt);

  return (
    <div className="mr-auto flex w-fit max-w-[80%] items-start gap-2.5 px-1 py-1 text-[13px] text-foreground/90 [animation:stream-fade_280ms_ease-out_both]">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ring-border bg-surface">
        <Logo size={12} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {toolCalls && toolCalls.length > 0 && (
          <div className="space-y-1 rounded-xl border border-border/60 bg-surface/40 px-2.5 py-1.5">
            {toolCalls.map((tc) => (
              <ChatToolRow key={tc.id} call={tc} />
            ))}
          </div>
        )}
        <div className="leading-relaxed whitespace-pre-wrap">
          {text}
          {streaming && (
            <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />
          )}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a, i) => (
              <SCButton
                key={i}
                variant="chip"
                size="sm"
                className="h-7 px-2.5 text-[11.5px]"
                onClick={() => {
                  if (a.kind === "retry-stage") retryStage(a.stageId);
                  else if (a.kind === "rerun-all" && briefPrompt) submit(briefPrompt);
                }}
              >
                {a.label}
              </SCButton>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatToolRow({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const running = call.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);

  const elapsed =
    call.status !== "running"
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

  const canExpand = !!(call.input || call.output);

  return (
    <div>
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
        className={cn(
          "group flex w-full items-center gap-1.5 py-0.5 text-left text-[12px] leading-relaxed",
          canExpand ? "cursor-pointer" : "cursor-default",
        )}
      >
        {running ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
        ) : call.status === "failed" ? (
          <AlertCircle className="h-3 w-3 shrink-0 text-status-failed" />
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
            "min-w-0 flex-1 truncate font-mono text-[11.5px]",
            running ? "text-foreground" : "text-foreground/75",
          )}
        >
          {call.label}
          {running && <span className="thinking-dots ml-0.5 text-accent" />}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
          {elapsed.toFixed(1)}s
        </span>
        {canExpand && (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {canExpand && (
        <Collapse open={open}>
          <div className="mt-1 space-y-1.5 rounded-md bg-surface-2/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {call.input && (
              <div>
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Input
                </div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-foreground/80">
                  {call.input}
                </pre>
              </div>
            )}
            {call.output && (
              <div>
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Output
                </div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-foreground/80">
                  {call.output}
                </pre>
              </div>
            )}
          </div>
        </Collapse>
      )}
    </div>
  );
}
