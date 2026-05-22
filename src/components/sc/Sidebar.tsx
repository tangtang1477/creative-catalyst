import {
  Plus,
  Search,
  Sparkles,
  Plug,
  FileText,
  Brain,
  CreditCard,
  ChevronDown,
  Settings,
} from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

const navItems = [
  { id: "new", icon: Plus, label: "New task" },
  { id: "search", icon: Search, label: "Search" },
  { id: "skills", icon: Sparkles, label: "Skills" },
  { id: "connections", icon: Plug, label: "Connections" },
  { id: "files", icon: FileText, label: "Files" },
  { id: "memory", icon: Brain, label: "Memory" },
];

const recentTasks = [
  { id: "ep1", label: "Episode One Video", badge: "Needs approval" },
  { id: "bmw", label: "BMW 15s Ad" },
  { id: "xiaomi", label: "Xiaomi Car Ad" },
];

const USER_NAME = "Victoria";
const USER_EMAIL = "Victoria@gmail.com";

export function Sidebar() {
  const { reset, taskTitle, phase } = useSC();

  return (
    <aside className="hidden md:flex h-screen w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Logo size={22} loading={phase === "running" || phase === "thinking"} glow={phase === "empty"} />
          <span className="text-[13px] font-semibold tracking-tight">
            Vibe Aideo
          </span>
        </div>
        <SCButton variant="icon" size="icon" aria-label="collapse">
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </SCButton>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 pt-1">
        {navItems.map((it) => (
          <SCButton
            key={it.id}
            variant="ghost"
            className="w-full justify-start gap-2 px-2"
            onClick={it.id === "new" ? reset : undefined}
          >
            <it.icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{it.label}</span>
          </SCButton>
        ))}
      </nav>

      {/* Tasks */}
      <div className="mt-3 flex-1 overflow-y-auto px-2">
        <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
          <span>Tasks</span>
          <ChevronDown className="h-3 w-3" />
        </div>
        <div className="flex flex-col gap-0.5">
          {phase !== "empty" && (
            <SCButton
              variant="ghost"
              className={cn(
                "w-full justify-between gap-2 px-2 text-foreground",
                "bg-surface-2",
              )}
            >
              <span className="truncate">{taskTitle}</span>
            </SCButton>
          )}
          {recentTasks.map((t) => (
            <SCButton
              key={t.id}
              variant="ghost"
              className="w-full justify-between gap-2 px-2 text-muted-foreground"
            >
              <span className="truncate">{t.label}</span>
              {t.badge && (
                <span className="ml-1 shrink-0 rounded bg-status-processing/15 px-1.5 py-0.5 text-[10px] text-status-processing">
                  {t.badge}
                </span>
              )}
            </SCButton>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="px-2 pb-2">
        <SCButton
          variant="outline"
          className="w-full justify-between gap-2 px-2"
        >
          <span className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 text-accent" />
            Pricing
          </span>
          <span className="rounded bg-status-failed/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-failed">
            51% OFF
          </span>
        </SCButton>
      </div>

      {/* User footer */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-status-ready to-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-foreground/90">
              {USER_NAME}
            </div>
            <div className="truncate text-[10.5px] text-muted-foreground">
              {USER_EMAIL}
            </div>
          </div>
          <SCButton variant="icon" size="icon" aria-label="settings">
            <Settings className="h-3.5 w-3.5" />
          </SCButton>
        </div>
      </div>
    </aside>
  );
}
