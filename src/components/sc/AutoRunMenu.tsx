import { Check, ChevronDown, Hand, Shield, Zap, ZapOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import type { AutoMode } from "@/lib/sc/types";

interface Props {
  disabled?: boolean;
}

const OPTIONS: { value: AutoMode; label: string; sub: string; icon: typeof Zap }[] = [
  { value: "auto", label: "Auto Run", sub: "全自动，连续推进", icon: Zap },
  { value: "blocker", label: "Blocker", sub: "关键阻塞项才问我", icon: ZapOff },
  { value: "guided", label: "Guided", sub: "关键节点确认", icon: Hand },
  { value: "strict", label: "Strict", sub: "严格按资料", icon: Shield },
];

const LABEL: Record<AutoMode, string> = {
  auto: "Auto Run",
  blocker: "Blocker",
  guided: "Guided",
  strict: "Strict",
};

export function AutoRunMenu({ disabled }: Props) {
  const { autoMode, setAutoMode } = useSC();
  const label = LABEL[autoMode] ?? "Auto Run";
  const isContinuous = autoMode === "auto" || autoMode === "blocker";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-8 select-none items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-medium leading-none text-foreground/85 outline-none transition-colors",
            "hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--surface-2))] hover:text-accent",
            "active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: isContinuous ? "var(--accent)" : "var(--muted-foreground)",
              boxShadow: isContinuous ? "0 0 6px var(--accent)" : "none",
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
        className="w-[280px] rounded-2xl border-border bg-surface p-1.5 shadow-2xl"
      >
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const selected = autoMode === o.value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => setAutoMode(o.value)}
              className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 text-[13px] text-foreground focus:bg-surface-2 data-[highlighted]:bg-surface-2"
            >
              <Icon className={cn("mt-0.5 h-4 w-4", selected ? "text-accent" : "text-foreground/70")} />
              <div className="flex-1">
                <div>{o.label}</div>
                <div className="text-[11px] text-muted-foreground">{o.sub}</div>
              </div>
              {selected && <Check className="mt-0.5 h-3.5 w-3.5 text-accent" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
