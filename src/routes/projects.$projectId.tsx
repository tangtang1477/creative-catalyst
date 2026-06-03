import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clapperboard, Folder, GraduationCap, Megaphone, Music2, Plus, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/sc/Sidebar";
import { DotGridBackground } from "@/components/sc/DotGridBackground";
import { useTheme } from "@/hooks/use-theme";
import { useProjects } from "@/lib/sc/projects-store";
import { useSC, titleMatchesProject } from "@/lib/sc/store";
import { listProjectTasks, backfillLegacyTasksForProject, attachTaskToProject } from "@/lib/tasks.functions";
import type { TaskRecord } from "@/lib/sc/types";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectDetailPage,
});

const KIND_ICON: Record<string, typeof Folder> = {
  series: Clapperboard,
  ad: Megaphone,
  education: GraduationCap,
  mv: Music2,
  custom: Folder,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ProjectDetailPage() {
  useTheme();
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const projects = useProjects((s) => s.projects);
  const projectsLoaded = useProjects((s) => s.loaded);
  const fetchProjects = useProjects((s) => s.fetchProjects);
  const setCurrentProject = useProjects((s) => s.setCurrentProject);
  const taskHistory = useSC((s) => s.taskHistory);
  const restoreTask = useSC((s) => s.restoreTask);
  const reset = useSC((s) => s.reset);

  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const project = projects.find((p) => p.id === projectId);
  const Icon = project ? KIND_ICON[project.kind] ?? Folder : Folder;

  // Sync current project so sidebar highlights this row.
  useEffect(() => {
    setCurrentProject(projectId);
  }, [projectId, setCurrentProject]);

  // Load projects if needed.
  useEffect(() => {
    if (!projectsLoaded) {
      void fetchProjects();
    }
  }, [projectsLoaded, fetchProjects]);

  // Pull remote tasks and merge into local taskHistory (similar to enterProject).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const { data: au } = await supabase.auth.getUser();
        if (!au.user) {
          setLoading(false);
          return;
        }
        const { tasks: remote } = await listProjectTasks({ data: { projectId: null } });
        if (cancelled) return;
        const proj = useProjects.getState().projects.find((p) => p.id === projectId);
        const ingest = (rows: Array<Record<string, unknown>>) => {
          const local = useSC.getState().taskHistory;
          const byId = new Map<string, TaskRecord>(local.map((t) => [t.id, t]));
          const loose: Array<{ id: string; projectId: string | null }> = [];
          for (const raw of rows) {
            const r = raw as {
              id: string;
              title?: string;
              prompt?: string;
              status?: string;
              project_id?: string | null;
              snapshot?: unknown;
              created_at?: string;
              updated_at?: string;
            };
            const snap = (r.snapshot ?? {}) as Partial<TaskRecord> & { status?: TaskRecord["status"] };
            const looseTitleMatch = !r.project_id && proj && titleMatchesProject(r.title, proj.name);
            const inferProjectId = r.project_id ?? (looseTitleMatch ? projectId : (byId.get(r.id)?.projectId ?? null));
            const rec: TaskRecord = {
              id: r.id,
              title: r.title ?? "Untitled",
              prompt: r.prompt ?? "",
              createdAt: snap.createdAt ?? (Date.parse(r.created_at ?? "") || Date.now()),
              updatedAt: snap.updatedAt ?? (Date.parse(r.updated_at ?? "") || Date.now()),
              status: snap.status ?? (r.status === "completed" ? "done" : (r.status as TaskRecord["status"]) ?? "done"),
              kind: snap.kind ?? "oneoff",
              assets: snap.assets ?? [],
              stageSummaries: snap.stageSummaries ?? {},
              stageSnapshots: snap.stageSnapshots ?? {},
              script: snap.script ?? null,
              failureReason: snap.failureReason ?? undefined,
              brief: snap.brief ?? null,
              projectId: inferProjectId,
            };
            byId.set(rec.id, rec);
            if (inferProjectId === projectId) loose.push({ id: r.id, projectId: r.project_id ?? null });
          }
          const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
          useSC.setState({ taskHistory: merged });
          // 异步把命中但 project_id 还是 NULL 的行落库
          void (async () => {
            for (const m of loose) {
              if (m.projectId) continue;
              if (!UUID_RE.test(m.id)) continue;
              await attachTaskToProject({ data: { taskId: m.id, projectId } }).catch(() => undefined);
            }
          })();
        };
        ingest(remote as Array<Record<string, unknown>>);

        // 仍然 0 命中 → backfill 兜底
        const hits = useSC.getState().taskHistory.filter(
          (t) => t.projectId === projectId || (!t.projectId && proj && titleMatchesProject(t.title, proj.name)),
        );
        if (hits.length === 0) {
          try {
            const res = await backfillLegacyTasksForProject({ data: { projectId } });
            if (res?.created && res.created > 0) {
              const { tasks: remote2 } = await listProjectTasks({ data: { projectId: null } });
              if (!cancelled) ingest(remote2 as Array<Record<string, unknown>>);
            }
          } catch (e) {
            console.warn("[projects/detail] backfill failed", e);
          }
        }
      } catch (e) {
        console.warn("[projects/detail] load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const tasks = useMemo(() => {
    if (!project) return [];
    return taskHistory
      .filter((t) => t.projectId === project.id || (!t.projectId && titleMatchesProject(t.title, project.name)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [taskHistory, project]);

  const handleOpenTask = (taskId: string) => {
    restoreTask(taskId);
    void navigate({ to: "/" });
  };

  const handleNewTask = () => {
    reset({ fromUserAction: true });
    setCurrentProject(projectId);
    void navigate({ to: "/" });
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
      <DotGridBackground />
      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur">
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Link
                to="/"
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-foreground/70 transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回首页
              </Link>
              <span>·</span>
              <span className="text-foreground">项目详情</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                刷新
              </button>
              <button
                type="button"
                onClick={handleNewTask}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                新任务
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[920px] px-6 py-8">
              {!project ? (
                <div className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-[13px] text-muted-foreground">
                  {projectsLoaded ? "项目不存在或已被删除。" : "加载中…"}
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
                        {project.name}
                      </h1>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        类型：{project.kind} · 创建于 <span suppressHydrationWarning>{mounted ? new Date(project.created_at).toLocaleString("zh-CN") : ""}</span> · 共 {tasks.length} 个任务
                      </p>
                    </div>
                  </div>

                  {loading && tasks.length === 0 ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2/40" />
                      ))}
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-10 text-center text-[13px] text-muted-foreground">
                      <div className="mb-2 font-medium text-foreground/80">该项目还没有任务</div>
                      <div className="mb-4">点击右上「新任务」开始一次新的创作，素材会自动归档到本项目。</div>
                      <button
                        type="button"
                        onClick={handleNewTask}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-accent-foreground hover:opacity-90"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新任务
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((t) => {
                        const imageCount = (t.assets ?? []).filter((a) => a.kind === "image").length;
                        const videoCount = (t.assets ?? []).filter((a) => a.kind === "video").length;
                        const date = mounted ? new Date(t.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                        const statusLabel =
                          t.status === "done" ? "已完成"
                            : t.status === "failed" ? "失败"
                              : t.status === "interrupted" ? "已中断"
                                : "运行中";
                        const statusColor =
                          t.status === "done" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                            : t.status === "failed" ? "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                              : t.status === "interrupted" ? "bg-muted-foreground/15 text-muted-foreground ring-muted-foreground/30"
                                : "bg-amber-500/15 text-amber-400 ring-amber-500/30";
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleOpenTask(t.id)}
                            className="group block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-foreground">
                                    {t.title || "Untitled"}
                                  </span>
                                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ring-1", statusColor)}>
                                    {statusLabel}
                                  </span>
                                </div>
                                {t.prompt && (
                                  <div className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                                    {t.prompt}
                                  </div>
                                )}
                                {t.failureReason && t.status === "failed" && (
                                  <div className="mt-1 line-clamp-2 text-[11.5px] text-rose-400/85">
                                    失败原因：{t.failureReason}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                  <span suppressHydrationWarning>{date}</span>
                                  <span>· 图片 {imageCount}</span>
                                  <span>· 视频 {videoCount}</span>
                                  <span>· 共 {t.assets?.length ?? 0} 个素材</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
