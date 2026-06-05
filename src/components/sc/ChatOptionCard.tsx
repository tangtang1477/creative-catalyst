import { useState } from "react";
import { Check, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import type { ChatOptionCard as ChatOptionCardT } from "@/lib/sc/types";

interface Props {
  msgId: string;
  card: ChatOptionCardT;
}

export function ChatOptionCard({ msgId, card }: Props) {
  const submitOptionCard = useSC((s) => s.submitOptionCard);
  const skipOptionCard = useSC((s) => s.skipOptionCard);
  const submitted = card.status !== "awaiting";

  // local selection state, keyed by question id
  const [answers, setAnswers] = useState<
    Record<string, { selected: string[]; otherText?: string }>
  >(() => {
    const init: Record<string, { selected: string[]; otherText?: string }> = {};
    for (const q of card.questions) {
      init[q.id] = { selected: q.selected ?? [], otherText: q.otherText };
    }
    return init;
  });
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});

  const toggle = (qid: string, oid: string, multi?: boolean) => {
    if (submitted) return;
    setAnswers((cur) => {
      const prev = cur[qid] ?? { selected: [] };
      const has = prev.selected.includes(oid);
      const next = multi
        ? has
          ? prev.selected.filter((x) => x !== oid)
          : [...prev.selected, oid]
        : has
          ? []
          : [oid];
      return { ...cur, [qid]: { ...prev, selected: next } };
    });
  };

  const setOther = (qid: string, v: string) => {
    setAnswers((cur) => ({ ...cur, [qid]: { ...(cur[qid] ?? { selected: [] }), otherText: v } }));
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-surface/50 px-4 py-3.5 backdrop-blur",
        "[animation:stream-fade_280ms_ease-out_both]",
        submitted && "opacity-80",
      )}
    >
      {card.intro && (
        <div className="mb-3 text-[12.5px] leading-relaxed text-foreground/85">
          {card.intro}
        </div>
      )}
      <ol className="space-y-3.5">

        {card.questions.map((q, idx) => {
          const ans = answers[q.id] ?? { selected: [] };
          return (
            <li key={q.id} className="space-y-1.5">
              <div className="text-[12.5px] text-foreground/85">
                <span className="text-muted-foreground">{idx + 1}.</span> {q.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((o) => {
                  const active = ans.selected.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={submitted}
                      onClick={() => toggle(q.id, o.id, q.multi)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11.5px] leading-none transition",
                        "border-border/70 bg-surface-2/60 text-foreground/80 hover:border-accent/60 hover:text-foreground",
                        active && "border-accent/80 bg-accent/15 text-foreground",
                        submitted && "cursor-default",
                      )}
                      title={o.hint}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {q.allowOther && !submitted && (
                  otherOpen[q.id] ? (
                    <input
                      autoFocus
                      value={ans.otherText ?? ""}
                      onChange={(e) => setOther(q.id, e.target.value)}
                      onBlur={() => {
                        if (!ans.otherText) setOtherOpen((o) => ({ ...o, [q.id]: false }));
                      }}
                      placeholder="自定义…"
                      className="h-7 rounded-full border border-accent/50 bg-surface-2/60 px-2.5 text-[11.5px] outline-none focus:border-accent"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOtherOpen((o) => ({ ...o, [q.id]: true }))}
                      className="rounded-full border border-dashed border-border/70 bg-transparent px-2.5 py-1 text-[11.5px] leading-none text-muted-foreground hover:text-foreground"
                    >
                      Other
                    </button>
                  )
                )}
                {q.allowOther && submitted && ans.otherText && (
                  <span className="rounded-full border border-accent/80 bg-accent/15 px-2.5 py-1 text-[11.5px] text-foreground">
                    {ans.otherText}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!submitted && card.outro && (
        <div className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {card.outro}
        </div>
      )}



      {!submitted && (
        <div className="mt-3.5 flex items-center justify-end gap-1.5 border-t border-border/40 pt-2.5">
          <SCButton
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[11.5px]"
            onClick={() => skipOptionCard(msgId, card.id)}
          >
            <X className="h-3 w-3" />
            Skip
          </SCButton>
          <SCButton
            variant="primary"
            size="sm"
            className="h-7 px-3 text-[11.5px]"
            onClick={() => submitOptionCard(msgId, card.id, answers)}
          >
            {card.primaryLabel ?? "Continue"}
            <ArrowRight className="h-3 w-3" />
          </SCButton>
        </div>
      )}
      {card.status === "submitted" && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Check className="h-3 w-3 text-status-ready" /> 已采纳，开始下一步
        </div>
      )}
      {card.status === "skipped" && (
        <div className="mt-3 text-[11px] text-muted-foreground">已跳过</div>
      )}
    </div>
  );
}
