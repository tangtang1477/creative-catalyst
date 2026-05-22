import { useState, type KeyboardEvent } from "react";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onConfirm: (value: string) => void;
  className?: string;
}

export function OthersChip({ onConfirm, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");

  const commit = () => {
    const t = v.trim();
    if (t) onConfirm(t);
    setV("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-xl border border-dashed border-border bg-transparent px-3 text-[12.5px] font-medium leading-none text-muted-foreground outline-none transition-colors",
          "hover:border-accent hover:text-accent",
          "active:scale-[0.97]",
          "focus-visible:ring-2 focus-visible:ring-accent",
          className,
        )}
      >
        <Plus className="h-3 w-3" />
        Others…
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-xl border border-accent bg-surface-2 pl-2 pr-1 text-[12.5px]",
        className,
      )}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setV("");
            setEditing(false);
          }
        }}
        placeholder="自定义…"
        className="h-6 w-32 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-accent text-accent-foreground hover:brightness-110"
        aria-label="confirm"
      >
        <Check className="h-3 w-3" />
      </button>
    </div>
  );
}
