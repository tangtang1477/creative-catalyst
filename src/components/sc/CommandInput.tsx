import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Plus, ArrowUp, Square } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { ModelMenu } from "./ModelMenu";
import { AutoRunMenu } from "./AutoRunMenu";
import { AttachMenu } from "./AttachMenu";
import { AttachmentChips } from "./AttachmentChips";
import { MentionPopover } from "./MentionPopover";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter";

interface Props {
  placeholder?: string;
  compact?: boolean;
}

const TYPEWRITER_PHRASES = [
  "做一个香奈儿香水的高端广告片",
  "拍一集都市恐怖短剧的第一集",
  "生成一支美食探店 vlog 的开场",
  "制作一支运动品牌的 15 秒 TVC",
  "做一个连续剧的第二集，主角是侦探",
  "生成一支宠物日常的治愈短片",
];

export function CommandInput({ placeholder, compact = false }: Props) {
  const {
    submit,
    phase,
    cancel,
    prompt,
    clearAttachments,
    intakeOthers,
    resolveIntakeOthers,
    cancelIntakeOthers,
  } = useSC();
  const [value, setValue] = useState(prompt ?? "");
  const [caret, setCaret] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // sync external prompt setter (e.g. SuggestionChips)
  if (prompt && prompt !== value && !value) {
    setValue(prompt);
  }

  const isProcessing =
    phase === "running" || phase === "thinking" || phase === "intake";
  const isThinking = phase === "thinking";
  const inputDisabled = isThinking;

  // typewriter placeholder: only when value empty AND no explicit placeholder passed
  const useTypewriter = !placeholder && !value && !isThinking && !intakeOthers;
  const typewriterText = useTypewriterPlaceholder(TYPEWRITER_PHRASES, {
    enabled: useTypewriter,
  });

  // auto-focus when Others triggered from intake card
  useEffect(() => {
    if (intakeOthers && taRef.current) {
      taRef.current.focus();
    }
  }, [intakeOthers]);

  const computedPlaceholder = isThinking
    ? "Thinking…"
    : intakeOthers
      ? `输入你想要的「${intakeOthers.label}」自定义内容，回车确认 · Esc 取消`
      : placeholder
        ? placeholder
        : typewriterText || " ";

  const doSubmit = () => {
    if (!value.trim() || inputDisabled) return;
    // if Others is active during intake, route input back to intake instead of starting new task
    if (intakeOthers) {
      resolveIntakeOthers(value);
      setValue("");
      return;
    }
    submit(value);
    setValue("");
    clearAttachments();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && intakeOthers) {
      e.preventDefault();
      cancelIntakeOthers();
      setValue("");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const handlePick = (insert: string, from: number, to: number) => {
    if (from < 0) {
      setCaret((c) => c);
      return;
    }
    const next = value.slice(0, from) + insert + value.slice(to);
    setValue(next);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        const pos = from + insert.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        setCaret(pos);
      }
    });
  };

  const updateCaret = () => {
    const ta = taRef.current;
    if (ta) setCaret(ta.selectionStart);
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset] transition-colors focus-within:border-accent/50",
        intakeOthers && "border-accent/60 ring-1 ring-accent/30",
      )}
    >
      <AttachmentChips />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          // Sync caret synchronously so MentionPopover sees the new @-token
          // on the same render that the character is added.
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={updateCaret}
        onClick={updateCaret}
        onSelect={updateCaret}
        onKeyDown={onKey}
        placeholder={computedPlaceholder}
        rows={compact ? 1 : 2}
        disabled={inputDisabled}
        className={cn(
          "block w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-wait disabled:opacity-70",
          compact ? "min-h-[36px]" : "min-h-[48px]",
        )}
      />
      <MentionPopover value={value} caret={caret} anchorRef={taRef} onPick={handlePick} />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1.5">
          <AttachMenu disabled={inputDisabled}>
            <button
              type="button"
              aria-label="attach"
              disabled={inputDisabled}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-transparent text-foreground/75 outline-none transition-all",
                "hover:border-accent/60 hover:bg-surface-2 hover:text-accent",
                "active:scale-95",
                "focus-visible:ring-2 focus-visible:ring-accent",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </AttachMenu>
          <ModelMenu disabled={inputDisabled} />
        </div>
        <div className="flex items-center gap-2">
          <AutoRunMenu disabled={inputDisabled} />
          {isProcessing ? (
            <button
              type="button"
              aria-label="cancel"
              onClick={cancel}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground outline-none transition-all",
                "hover:brightness-110 hover:shadow-[0_0_12px_rgba(113,240,246,0.5)]",
                "active:scale-95",
                "focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="send"
              disabled={!value.trim() || inputDisabled}
              onClick={doSubmit}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground outline-none transition-all",
                "hover:brightness-110 hover:shadow-[0_0_12px_rgba(113,240,246,0.5)]",
                "active:scale-95",
                "focus-visible:ring-2 focus-visible:ring-accent",
                "disabled:pointer-events-none disabled:opacity-40 disabled:bg-surface-2 disabled:text-muted-foreground disabled:shadow-none",
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
