import {
  Plus,
  Check,
  Zap,
  Brain,
  Settings,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { CreditRing } from "./credits/CreditRing";
import { CreditsHoverPanel } from "./credits/CreditsHoverPanel";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";

const USER = {
  name: "Victoria@gmail.com",
  email: "Victoria@gmail.com",
  workspace: "Victoria@gmail.com",
  plan: "Plus Plan",
};

export function UserHoverCard({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme, toggle } = useTheme();
  const openPricing = useCredits((s) => s.openPricing);
  // 顶部进度条与外圈圆环同口径：账户余额 / 200，≥ 200 时 100%
  const pctRemain = useCredits(creditsSelectors.ringPercent);
  const remaining = useCredits(creditsSelectors.remaining);


  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left outline-none transition-colors",
            "hover:bg-surface-2",
            collapsed && "justify-center px-0",
          )}
        >
          <CreditRing size={30} stroke={2}>
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-status-ready to-accent">
              <span className="text-[10px] font-bold text-background">V</span>
            </span>
          </CreditRing>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground">{USER.name}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">{USER.plan}</div>
              </div>
              <button
                type="button"
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {theme === "dark" ? (
                  <Moon className="h-3.5 w-3.5" />
                ) : (
                  <Sun className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>
      </HoverCardTrigger>

      <HoverCardContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[300px] rounded-2xl border-border bg-surface p-2 shadow-2xl"
      >
        {/* Workspace header */}
        <div className="flex items-center gap-2.5 px-2 py-2">
          <CreditRing size={40} stroke={2.5}>
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-status-ready to-accent">
              <span className="text-[12px] font-bold text-background">V</span>
            </span>
          </CreditRing>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{USER.workspace}</div>
            <div className="text-[11px] text-muted-foreground">{USER.plan}</div>
            <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${Math.round(pctRemain * 100)}%`,
                  background:
                    remaining <= 20
                      ? "var(--credit-critical)"
                      : remaining <= 50
                        ? "var(--credit-low)"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>
        </div>

        {/* User row */}
        <button className="mt-1 flex w-full items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2 hover:bg-surface-2/80">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-[10px] font-semibold">
            V
          </span>
          <span className="flex-1 text-left text-[12.5px]">{USER.name}</span>
          <Check className="h-3.5 w-3.5 text-accent" />
        </button>

        <button className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2/60 py-2 text-[12.5px] hover:bg-surface-2">
          <Plus className="h-3.5 w-3.5" />
          New workspace
        </button>

        {/* Credits */}
        <CreditsHoverPanel onTopUp={openPricing} />

        {/* Top-up / Boost */}
        <div className="mt-2 overflow-hidden rounded-xl bg-surface-2/60">
          <Row icon={<Zap className="h-3.5 w-3.5 text-accent" />} label="Top-up credits" cta onClick={openPricing} />
          <div className="mx-2 h-px bg-border" />
          <Row icon={<Zap className="h-3.5 w-3.5 text-accent" />} label="Boost speed" cta />
        </div>

        {/* Theme toggle — sliding pill */}
        <div className="relative mt-2 flex items-center rounded-full bg-surface-2 p-0.5">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,.15)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ transform: theme === "light" ? "translateX(100%)" : "translateX(0)" }}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTheme("dark"); }}
            className={cn(
              "relative z-10 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors",
              theme === "dark" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTheme("light"); }}
            className={cn(
              "relative z-10 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors",
              theme === "light" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </button>
        </div>


        {/* Bottom items */}
        <div className="mt-1.5">
          <MenuItem icon={<Brain className="h-3.5 w-3.5" />} label="Import Memory" />
          <MenuItem icon={<Settings className="h-3.5 w-3.5" />} label="Manage Account" />
          <MenuItem
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Increase Concurrent"
            badge="New"
          />
          <MenuItem icon={<DiscordIcon />} label="Join Community" />
        </div>

        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} label="Sign Out" />
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({ icon, label, cta, onClick }: { icon: React.ReactNode; label: string; cta?: boolean; onClick?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="flex items-center gap-2 text-[12.5px]">
        {icon}
        {label}
      </span>
      {cta && (
        <button onClick={onClick} className="rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-accent-foreground hover:brightness-110">
          Get
        </button>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] hover:bg-surface-2">
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      {badge && (
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          {badge}
        </span>
      )}
    </button>
  );
}

function DiscordIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.3 4.4A17 17 0 0016 3.2l-.2.4a16 16 0 00-7.6 0L8 3.2A17 17 0 003.7 4.4 17 17 0 001 13c1.7 1.3 3.4 2 5 2.5l.4-.6c-.6-.2-1.2-.5-1.7-.9l.4-.3c3.3 1.5 6.8 1.5 10 0l.4.3c-.5.4-1.1.7-1.7.9l.4.6c1.7-.5 3.3-1.2 5-2.5a17 17 0 00-2.7-8.6zM8.3 12.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  );
}
