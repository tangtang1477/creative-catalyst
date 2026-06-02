import { useEffect, useState } from "react";
import { Folder, X, Sparkles, Check } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { useProjects } from "@/lib/sc/projects-store";
import { cn } from "@/lib/utils";

const SESSION_KEY = "sc.projectGuide.dismissed";

/**
 * Inline 项目引导卡片 — 在 Workspace task 列表上方显示。
 * 触发条件：
 *   (a) 用户的 prompt / brief 中出现「第 X 集 / 下一集 / 系列 / 第二季 / 剧本」等关键词
 *   (b) phase === "done"（兜底）
 * 用户点击「创建项目」会打开 CreateProjectDialog（预填项目名）。
 */
export function ProjectGuideCard() {
  const phase = useSC((s) => s.phase);
  const brief = useSC((s) => s.brief);
  const taskTitle = useSC((s) => s.taskTitle);
  const attachments = useSC((s) => s.attachments);
  const openCreate = useProjects((s) => s.openCreate);
  const projects = useProjects((s) => s.projects);
  const currentProjectId = useProjects((s) => s.currentProjectId);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(SESSION_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Triggers
  const text = `${brief?.prompt ?? ""} ${taskTitle ?? ""}`.toLowerCase();
  const SERIES_KEYWORDS = ["第一集", "第二集", "第三集", "下一集", "系列", "第二季", "剧本", "episode", "series"];
  const matchedKeyword = SERIES_KEYWORDS.some((k) => text.includes(k));
  const hasScriptAttachment = attachments.some(
    (a) => /\.(txt|md|pdf|docx?)$/i.test(a.name) || /script|剧本/i.test(a.name),
  );
  const isFinished = phase === "done";

  const triggered = !dismissed && (matchedKeyword || hasScriptAttachment || isFinished);
  if (!triggered || phase === "empty") return null;

  // If already created a project matching this title (or auto-attached), show success state
  const presetName = (taskTitle || brief?.prompt?.slice(0, 24) || "新项目").trim();
  const matchingProject = currentProject ?? projects.find((p) => p.name === presetName) ?? null;

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (matchingProject) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] px-4 py-3 text-[12.5px] [animation:stream-fade_320ms_ease-out_both]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Check className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">
            已自动归档到项目 ·{" "}
            <span className="text-accent">{matchingProject.name}</span>
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            后续素材、角色、音色都会保存到此项目，便于制作下一集。
          </div>
        </div>
        <button
          type="button"
          aria-label="dismiss"
          onClick={handleDismiss}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }


  return (
    <div
      className={cn(
        "group relative mb-4 flex items-start gap-3 rounded-2xl border border-border bg-gradient-to-r from-surface-2/80 via-surface/60 to-surface-2/40 p-4 shadow-sm transition-all",
        "hover:border-accent/40 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_30%,transparent)]",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Folder className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
            保存为项目，方便制作后续集数
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            <Sparkles className="h-2.5 w-2.5" />
            智能引导
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          自动归档本集素材、角色、音色与 Brief，下一集可一键沿用风格与参数。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate({ name: presetName, kind: "series" })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            创建项目
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-8 items-center rounded-full px-3 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            暂不
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="dismiss"
        onClick={handleDismiss}
        className="invisible absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground group-hover:visible"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
