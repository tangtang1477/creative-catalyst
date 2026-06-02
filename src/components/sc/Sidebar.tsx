import { useEffect, useMemo, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Sparkles,
  Plug,
  FileText,
  Brain,
  Gem,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Settings,
  Trash2,
} from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { PulseDot } from "./PulseDot";
import { UserHoverCard } from "./UserHoverCard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCredits } from "@/lib/sc/credits-store";
import { useProjects } from "@/lib/sc/projects-store";
import { supabase } from "@/integrations/supabase/client";
import { FolderPlus, Folder, DollarSign, GraduationCap, PenTool, Plane } from "lucide-react";

const KIND_ICON: Record<string, typeof Folder> = {
  investment: DollarSign,
  homework: GraduationCap,
  writing: PenTool,
  travel: Plane,
  custom: Folder,
};
const KIND_COLOR: Record<string, string> = {
  investment: "text-emerald-400",
  homework: "text-sky-400",
  writing: "text-violet-400",
  travel: "text-amber-400",
  custom: "text-muted-foreground",
};

const navItems = [
  { id: "new", icon: Plus, label: "New task" },
  { id: "search", icon: Search, label: "Search" },
  { id: "skills", icon: Sparkles, label: "Skills" },
  { id: "connections", icon: Plug, label: "Connections" },
  { id: "files", icon: FileText, label: "Files" },
  { id: "memory", icon: Brain, label: "Memory" },
];

const SIDEBAR_KEY = "sc.sidebar";

export function Sidebar() {
  const {
    reset,
    taskTitle,
    phase,
    taskId,
    taskHistory,
    restoreTask,
    deleteTask,
  } = useSC();
  const openPricing = useCredits((s) => s.openPricing);

  const hydrated = useHydrated();
  const [open, setOpen] = useState<boolean>(true);
  useEffect(() => {
    const v = window.localStorage.getItem(SIDEBAR_KEY);
    if (v === "0") setOpen(false);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  const [tasksOpen, setTasksOpen] = useState(true);

  // current active task injected on top of history
  const tasks = useMemo(() => {
    const active =
      phase !== "empty" && taskId
        ? [{
            id: taskId,
            title: taskTitle,
            prompt: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: phase === "done" ? "done" : phase === "failed" ? "failed" : "running" as const,
            kind: "oneoff" as const,
            assets: [],
          }]
        : [];
    const rest = taskHistory.filter((t) => t.id !== taskId).slice(0, 12);
    return [...active, ...rest];
  }, [phase, taskId, taskTitle, taskHistory]);

  const handleNewTask = () => {
    if (phase === "running" || phase === "thinking") {
      const ok = window.confirm("当前任务正在进行，确认开启新任务？已生成的内容会保留在 Tasks。");
      if (!ok) return;
    }
    reset({ fromUserAction: true });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        data-open={open}
        className={cn(
          "hidden md:flex h-screen shrink-0 flex-col border-r border-border bg-surface",
          "transition-[width] duration-300 ease-out",
          open ? "w-[228px]" : "w-[56px]",
        )}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-1 px-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Logo
              size={22}
              loading={phase === "running" || phase === "thinking"}
              glow={phase === "empty"}
            />
            <span
              className={cn(
                "truncate text-[13px] font-semibold tracking-tight transition-opacity duration-200",
                open ? "opacity-100" : "pointer-events-none w-0 opacity-0",
              )}
            >
              Vibe Aideo
            </span>
          </div>
          <SCButton
            variant="icon"
            size="icon"
            aria-label={open ? "collapse" : "expand"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronsLeft className="h-3.5 w-3.5" />
            ) : (
              <ChevronsRight className="h-3.5 w-3.5" />
            )}
          </SCButton>
        </div>

        {/* Nav */}
        <nav className={cn("flex flex-col gap-0.5", open ? "px-2 pt-1" : "px-1.5 pt-1")}>
          {navItems.map((it) => {
            const btn = (
              <SCButton
                key={it.id}
                variant="ghost"
                className={cn(
                  "w-full gap-2",
                  open ? "justify-start px-2" : "justify-center px-0",
                )}
                onClick={it.id === "new" ? handleNewTask : undefined}
              >
                <it.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {open && <span>{it.label}</span>}
              </SCButton>
            );
            return open ? (
              btn
            ) : (
              <Tooltip key={it.id}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right">{it.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Tasks */}
        {open && (
          <div className="mt-3 flex-1 overflow-y-auto px-2">
            <button
              onClick={() => setTasksOpen((v) => !v)}
              className="flex w-full items-center justify-between px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <span>Tasks</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  !tasksOpen && "-rotate-90",
                )}
              />
            </button>
            {tasksOpen && hydrated && (
              <div className="flex flex-col gap-0.5">
                {tasks.length === 0 && (
                  <div className="px-2 py-3 text-[11px] text-muted-foreground">
                    暂无历史任务
                  </div>
                )}
                {tasks.map((t) => {
                  const isActive = t.id === taskId;
                  const isRunning = t.status === "running";
                  const isFailed = t.status === "failed";
                  const disabled = isActive || isRunning;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "group relative flex items-center gap-1 rounded-lg pl-1.5 pr-1 transition-colors",
                        isActive ? "bg-surface-2" : "hover:bg-surface-2/60",
                      )}
                    >
                      {/* active line indicator */}
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <button
                        onClick={() => !disabled && restoreTask(t.id)}
                        disabled={disabled}
                        title={isRunning && !isActive ? "该任务正在运行，无法回放" : undefined}
                        className={cn(
                          "flex h-7 min-w-0 flex-1 items-center justify-between gap-2 px-1.5 text-[12px]",
                          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                          disabled && !isActive && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <span className="truncate text-left">{t.title}</span>
                        {isRunning && <PulseDot />}
                        {isFailed && (
                          <span className="h-2 w-2 rounded-full bg-status-failed" />
                        )}
                      </button>
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(t.id);
                          }}
                          aria-label="delete task"
                          className="invisible h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground group-hover:visible"
                        >
                          <Trash2 className="mx-auto h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {!open && <div className="flex-1" />}

        {/* Pricing */}
        <div className={cn("px-2 pb-2", !open && "px-1.5")}>
          {open ? (
            <button
              onClick={openPricing}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-2xl bg-surface-2/70 px-3 py-2.5 ring-1 ring-border transition-colors",
                "hover:ring-accent/60 hover:bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface-2))]",
                "active:scale-[0.99]",
              )}
            >
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                <Gem className="h-4 w-4 text-accent" />
                Pricing
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                51% OFF
              </span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openPricing}
                  className="flex h-9 w-full items-center justify-center rounded-xl bg-surface-2 hover:bg-accent/15"
                >
                  <Gem className="h-4 w-4 text-accent" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Pricing · 51% OFF</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* User footer */}
        <div className={cn("border-t border-border", open ? "px-2 py-2" : "px-1.5 py-2")}>
          <UserHoverCard collapsed={!open} />
        </div>
      </aside>
    </TooltipProvider>
  );
}
