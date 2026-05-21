import { useState, type KeyboardEvent } from "react";
import { Plus, ArrowUp, ChevronDown, Square } from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

interface Props {
  placeholder?: string;
  compact?: boolean;
}

export function CommandInput({ placeholder = "Enter Command", compact = false }: Props) {
  const { submit, phase, cancel } = useSC();
  const [value, setValue] = useState("");

  const isProcessing = phase === "running";
  const isThinking = phase === "thinking";
  const inputDisabled = isThinking;

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !inputDisabled) {
        submit(value);
        setValue("");
      }
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset] transition-colors focus-within:border-accent/50",
        compact ? "" : "",
      )}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={isThinking ? "Thinking…" : placeholder}
        rows={compact ? 1 : 2}
        disabled={inputDisabled}
        className={cn(
          "block w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-wait disabled:opacity-70",
          compact ? "min-h-[36px]" : "min-h-[48px]",
        )}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1">
          <SCButton variant="icon" size="icon" aria-label="attach" disabled={inputDisabled}>
            <Plus className="h-3.5 w-3.5" />
          </SCButton>
          <SCButton variant="ghost" size="sm" className="gap-1.5" disabled={inputDisabled}>
            <Logo size={14} loading={isThinking || isProcessing} />
            <span>Vibe Aideo</span>
            <span className="text-muted-foreground">v1</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </SCButton>
        </div>
        <div className="flex items-center gap-1">
          <SCButton variant="ghost" size="sm" className="gap-1" disabled={inputDisabled}>
            <span>Auto Run</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </SCButton>
          {isProcessing ? (
            <SCButton
              variant="primary"
              size="icon"
              aria-label="cancel"
              onClick={cancel}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </SCButton>
          ) : (
            <SCButton
              variant="primary"
              size="icon"
              aria-label="send"
              disabled={!value.trim() || inputDisabled}
              onClick={() => {
                submit(value);
                setValue("");
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </SCButton>
          )}
        </div>
      </div>
    </div>
  );
}
