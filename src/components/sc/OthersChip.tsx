import { Plus } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

interface Props {
  questionKey: string;
  questionLabel: string;
  className?: string;
}

/**
 * Clicking "Others…" no longer opens an inline input. Instead it asks
 * the user to type their custom answer in the bottom command bar — same
 * pattern as ChatGPT's "Other" affordance.
 */
export function OthersChip({ questionKey, questionLabel, className }: Props) {
  const { requestIntakeOthers, intakeOthers } = useSC();
  const active = intakeOthers?.key === questionKey;

  return (
    <button
      type="button"
      onClick={() => requestIntakeOthers(questionKey, questionLabel)}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-xl border border-dashed px-3 text-[12.5px] font-medium leading-none outline-none transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-transparent text-muted-foreground hover:border-accent hover:text-accent",
        "active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <Plus className="h-3 w-3" />
      {active ? "请在下方输入框输入…" : "Others…"}
    </button>
  );
}
