import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import type { ChatToolCall, ChatOptionCard as ChatOptionCardT } from "@/lib/sc/types";
import { ChatOptionCard } from "./ChatOptionCard";

interface ChatAgentMessageProps {
  id: string;
  text: string;
  streaming?: boolean;
  toolCalls?: ChatToolCall[];
  optionCards?: ChatOptionCardT[];
  skill?: { name: string; sub?: string };
  actions?: Array<
    | { label: string; kind: "retry-stage"; stageId: import("@/lib/sc/types").StageId }
    | { label: string; kind: "rerun-all" }
  >;
}

const PILL_VERBS = [
  "Building the scene",
  "Adding the details",
  "Painting the frame",
  "Bringing it to life",
];

export function ChatAgentMessage({
  id,
  text,
  streaming,
  toolCalls,
  optionCards,
  skill,
  actions,
}: ChatAgentMessageProps) {
  const retryStage = useSC((s) => s.retryStage);
  const submit = useSC((s) => s.submit);
  const briefPrompt = useSC((s) => s.brief?.prompt);

  // 顶部 skill 行：若未指定，根据当前 toolCall 推断
  const runningTool = toolCalls?.find((tc) => tc.status === "running");
  const skillName = skill?.name ?? "chat-director";
  const skillSub =
    skill?.sub ??
    (streaming
      ? runningTool?.label
        ? `· ${runningTool.label}`
        : "· streaming reply"
      : undefined);

  // 底部状态药丸：流式中显示，结束后或有待选项卡时隐藏
  const awaitingCard = optionCards?.some((c) => c.status === "awaiting");
  const showPill = streaming && !awaitingCard;
  const [pillIdx, setPillIdx] = useState(0);
  useEffect(() => {
    if (!showPill) return;
    const t = window.setInterval(() => setPillIdx((n) => n + 1), 1800);
    return () => clearInterval(t);
  }, [showPill]);
  const pillVerb = streaming && !text ? "Thinking" : PILL_VERBS[pillIdx % PILL_VERBS.length];

  return (
    <div className="flex w-full flex-col gap-2 [animation:stream-fade_280ms_ease-out_both]">
      {/* 顶部 skill 行 — 无头像 */}
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent/85">
        <Sparkles className="h-3 w-3" />
        <span>
          {streaming ? "Using skill" : "Used skill"}{" "}
          <span className="bg-gradient-to-r from-accent to-accent/60 bg-clip-text font-mono text-[11.5px] text-transparent">
            {skillName}
          </span>
        </span>
        {skillSub && (
          <span className="truncate text-muted-foreground/80">{skillSub}</span>
        )}
      </div>

      {/* 正文 markdown 流式 */}
      {(text || streaming) && (
        <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          ) : null}
          {streaming && text && (
            <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />
          )}
        </div>
      )}

      {/* 选项卡片 */}
      {optionCards && optionCards.length > 0 && (
        <div className="space-y-2">
          {optionCards.map((c) => (
            <ChatOptionCard key={c.id} msgId={id} card={c} />
          ))}
        </div>
      )}

      {/* 行动 chips */}
      {actions && actions.length > 0 && !streaming && (
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

      {/* 底部状态药丸 */}
      {showPill && (
        <div
          className={cn(
            "mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-2.5 py-1 text-[11.5px] text-muted-foreground",
            "backdrop-blur",
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          <span className="font-mono">{pillVerb}</span>
          <span className="thinking-dots text-accent" />
        </div>
      )}
      {awaitingCard && (
        <div className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11.5px] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span>Awaiting your input</span>
        </div>
      )}
    </div>
  );
}
