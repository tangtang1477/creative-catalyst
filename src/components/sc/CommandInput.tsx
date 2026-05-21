import { useState, type KeyboardEvent } from "react";
import { Plus, ArrowUp, ChevronDown, Sparkles, Square } from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

interface Props {
  placeholder?: string;
  compact?: boolean;
}

export function CommandInput({ placeholder = "Enter Command", compact = false }: Props) {
  const { submit, phase, cancel } = useSC();
  const [value, setValue] = useState("");

  const isProcessing = phase === "running";

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        submit(value);
        setValue("");
      }
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset]",
        compact ? "" : "",
      )}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={compact ? 1 : 2}
        className={cn(
          "block w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none",
          compact ? "min-h-[36px]" : "min-h-[48px]",
        )}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1">
          <SCButton variant="icon" size="icon" aria-label="attach">
            <Plus className="h-3.5 w-3.5" />
          </SCButton>
          <SCButton variant="ghost" size="sm" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Claude</span>
            <span className="text-muted-foreground">Sonnet 4.6</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </SCButton>
        </div>
        <div className="flex items-center gap-1">
          <SCButton variant="ghost" size="sm" className="gap-1">
            <span>Auto Run</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </SCButton>
          {isProcessing ? (
            <SCButton
              variant="primary"
              size="icon"
              aria-label="cancel"
              onClick={cancel}
              className="bg-accent text-accent-foreground"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </SCButton>
          ) : (
            <SCButton
              variant="primary"
              size="icon"
              aria-label="send"
              disabled={!value.trim()}
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
