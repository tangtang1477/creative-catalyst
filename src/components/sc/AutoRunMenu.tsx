import { Check, ChevronDown, Hand, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";

interface Props {
  disabled?: boolean;
}

export function AutoRunMenu({ disabled }: Props) {
  const { autoMode, setAutoMode } = useSC();
  const label = autoMode === "auto" ? "Auto Run · Auto" : "Auto Run · Confirm";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-8 select-none items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-medium leading-none text-foreground/85 outline-none transition-colors",
            "hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--surface-2))] hover:text-accent",
            "active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: autoMode === "auto" ? "var(--accent)" : "var(--muted-foreground)",
              boxShadow: autoMode === "auto" ? "0 0 6px var(--accent)" : "none",
            }}
          />
          <span>{label}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-[260px] rounded-2xl border-border bg-surface p-1.5 shadow-2xl"
      >
        <DropdownMenuItem
          onSelect={() => setAutoMode("auto")}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-[13px] text-foreground focus:bg-surface-2 data-[highlighted]:bg-surface-2"
        >
          <Zap className="h-4 w-4 text-accent" />
          <span className="flex-1">Auto-run without asking</span>
          {autoMode === "auto" && <Check className="h-3.5 w-3.5 text-accent" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setAutoMode("confirm")}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-[13px] text-foreground focus:bg-surface-2 data-[highlighted]:bg-surface-2"
        >
          <Hand className="h-4 w-4 text-foreground/70" />
          <span className="flex-1">Confirm before running</span>
          {autoMode === "confirm" && <Check className="h-3.5 w-3.5 text-accent" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
