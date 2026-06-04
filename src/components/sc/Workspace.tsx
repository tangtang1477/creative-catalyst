import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSC, titleMatchesProject } from "@/lib/sc/store";

import { CommandInput } from "./CommandInput";
import { SuggestionChips } from "./SuggestionChips";
import { IntakeCard } from "./IntakeCard";
import { StageRow } from "./StageRow";
import { ScriptTable, StoryboardTable } from "./ScriptTable";
import { AssetCard } from "./AssetCard";
import { QualityCheck } from "./QualityCheck";
import { ApprovalChips } from "./ApprovalChips";
import { SeriesBible } from "./SeriesBible";
import { WardrobePanel } from "./WardrobePanel";
import { QCPanel } from "./QCPanel";
import { ViewModeToggle } from "./ViewModeToggle";
import { CanvasView } from "./canvas/CanvasView";
import { STAGE_ORDER } from "@/lib/sc/types";
import { KEYFRAME_PROMPT_DETAIL as FALLBACK_PROMPT_DETAIL, RECOVERY_NOTES } from "@/lib/sc/samples";
import { SCButton } from "./Button";

import { Calendar, GalleryHorizontal, Zap } from "lucide-react";
import { Logo } from "./Logo";
import { InlineLowCredit } from "./credits/InlineLowCredit";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { StageBoundary } from "./StageBoundary";
import { VersionDrawer } from "./VersionDrawer";
import { ChatAgentMessage } from "./ChatAgentMessage";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ProjectGuideCard } from "./ProjectGuideCard";
import { AssetPreviewDialog } from "./AssetPreviewDialog";
import { ChatOptionCard } from "./ChatOptionCard";
import { useProjects } from "@/lib/sc/projects-store";
import { Folder as FolderIcon, FolderPlus as FolderPlusIcon, Clapperboard, Megaphone, GraduationCap, Music2 } from "lucide-react";

const HOME_KIND_ICON: Record<string, typeof FolderIcon> = {
  series: Clapperboard,
  ad: Megaphone,
  education: GraduationCap,
  mv: Music2,
  custom: FolderIcon,
};

import { cn } from "@/lib/utils";

export function Workspace() {
  const { phase, taskTitle, brief, stages, assets, gate, rail, setRailOpen, viewMode, chatLog } = useSC();
  const script = useSC((s) => s.script);
  const retryStage = useSC((s) => s.retryStage);
  const submit = useSC((s) => s.submit);
  const openPricing = useCredits((s) => s.openPricing);
  const remaining = useCredits(creditsSelectors.remaining);
  const paintAssets = assets.filter((a) => a.stageId === "paint");
  const inFlow = phase === "running" || phase === "done" || phase === "failed";

  // ChatGPT-like auto-scroll to bottom when new content streams in.
  const endRef = useRef<HTMLDivElement | null>(null);
  const stagesKey = STAGE_ORDER.map((id) => `${stages[id].status}:${stages[id].summary.length}:${stages[id].toolCalls.length}:${stages[id].thoughts.length}`).join("|");
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog.length, stagesKey, assets.length]);

  return (
    <div className="relative flex h-screen min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          {phase === "empty" ? (
            <span className="flex items-center gap-1.5">
              <Logo size={14} glow />
              Vibe Aideo · Premium AI ad-video agent
            </span>
          ) : (
            <span className="flex items-center gap-2 text-foreground">
              <Logo size={14} loading={phase === "running" || phase === "thinking"} glow={phase === "done"} />
              {taskTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <SCButton variant="ghost" size="sm" className="gap-1.5" onClick={openPricing}>
            <Zap className="h-3.5 w-3.5" />
            Buy credits
          </SCButton>
          {phase !== "empty" && (
            <>
              <SCButton variant="ghost" size="sm" className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Scheduled
              </SCButton>
              {inFlow && <ViewModeToggle />}
              <SCButton
                variant="ghost"
                size="sm"
                className={cn("gap-1.5", rail.open && "bg-accent/15 text-accent")}
                onClick={() => setRailOpen(!rail.open)}
              >
                <GalleryHorizontal className="h-3.5 w-3.5" />
                Gallery
              </SCButton>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {inFlow && viewMode === "canvas" ? (
          <CanvasView />
        ) : (
          <div className="relative z-10 h-full overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-6 py-6">
              {phase === "empty" && (
                <div className="flex flex-1 flex-col justify-center pb-20">
                  <ActiveProjectBanner />
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-accent/85">
                    <span className="h-1 w-1 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
                    Using skill ai-video-studio
                  </div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2/70 backdrop-blur ring-1 ring-border-strong">
                      <Logo size={28} glow />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                        Victoria, what are we creating today?
                      </h1>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        告诉我类型和目标，或直接选下面的方向 — 短片、剧集、广告、MV、纪录、UGC 都行。
                      </p>
                    </div>
                  </div>
                  <CommandInput />
                  <div className="mt-4">
                    <SuggestionChips />
                  </div>
                  <HomeProjectsRow />
                </div>
              )}

              {phase === "thinking" && (
                <div className="flex-1 space-y-3">
                  {brief?.prompt && (
                    <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px]">
                      {brief.prompt}
                    </div>
                  )}
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3 [animation:stream-fade_320ms_ease-out_both]">
                    <Logo size={20} loading />
                    <span className="text-[12.5px] text-muted-foreground">
                      Thinking<span className="thinking-dots" />
                    </span>
                  </div>
                </div>
              )}

              {phase === "intake" && (
                <div className="flex-1 space-y-4">
                  <IntakeCard />
                </div>
              )}

              {inFlow && (
                <div className="flex-1 space-y-5">
                  <ProjectGuideCard />


                  {brief?.prompt && (
                    <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px]">
                      {brief.prompt}
                    </div>
                  )}

                  {brief && brief.adType && brief.format && brief.format !== "—" && (
                    <div className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-[12.5px] [animation:stream-fade_320ms_ease-out_both]">
                      <div className="mb-1.5 flex items-center gap-2 font-medium">
                        <span>Selected Brief</span>
                        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10.5px] font-mono uppercase tracking-wider text-accent">
                          {brief.adType}
                        </span>
                      </div>
                      <ul className="space-y-0.5 text-muted-foreground">
                        <li>· Video type: {brief.adType}</li>
                        <li>· Format: {brief.format}</li>
                        <li>· Visual: {brief.visualSource}</li>
                        <li>· Mode: {brief.mode}</li>
                      </ul>
                    </div>
                  )}

                  {brief && (!brief.adType || brief.format === "—") && assets.length > 0 && (
                    <div className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-[12.5px] [animation:stream-fade_320ms_ease-out_both]">
                      <div className="mb-1.5 flex items-center gap-2 font-medium">
                        <span>项目快照</span>
                        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10.5px] font-mono uppercase tracking-wider text-accent">
                          RESTORED
                        </span>
                      </div>
                      <ul className="space-y-0.5 text-muted-foreground">
                        <li>· 项目：{taskTitle || "—"}</li>
                        <li>· 镜头数：{assets.filter((a) => a.kind === "video").length || assets.length}</li>
                        <li>· 素材总数：{assets.length}（图片 {assets.filter((a) => a.kind === "image").length} · 视频 {assets.filter((a) => a.kind === "video").length}）</li>
                        {brief.prompt && brief.prompt !== taskTitle && (
                          <li className="line-clamp-2">· 原始 prompt：{brief.prompt}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <SeriesBible />

                  {/* Refining brief / preflight option cards — only the AWAITING ones are pinned above; once submitted/skipped they stay in their original chat position so users see the confirmation in context, not at the very bottom. */}
                  {chatLog
                    .flatMap((m) =>
                      (m.optionCards ?? [])
                        .filter((c) => c.status === "awaiting")
                        .map((c) => ({ msgId: m.id, card: c })),
                    )
                    .map(({ msgId, card }) => (
                      <ChatOptionCard key={`${msgId}-${card.id}-top`} msgId={msgId} card={card} />
                    ))}


                  {STAGE_ORDER.map((id) => {
                    const st = stages[id];
                    if (st.status === "pending") return null;


                    if (id === "structure") {
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow
                            id={id}
                            state={st}
                            details={
                              <pre className="whitespace-pre-wrap font-sans">
                                脚本完整版（含分镜机位、镜头时长、音效层、混音建议）。
                              </pre>
                            }
                            detailsLabel="Full scene plan"
                          >
                            <div className="space-y-2">
                              <ScriptTable />
                              <StoryboardTable />
                            </div>
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "wardrobe") {
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow id={id} state={st} keepChildrenWhenCollapsed>
                            <WardrobePanel />
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "cast") {
                      const castAssets = assets.filter((a) => a.stageId === "cast");
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow id={id} state={st} keepChildrenWhenCollapsed>
                            {castAssets.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {castAssets.map((a) => (
                                  <AssetCard key={a.id} asset={a} compact />
                                ))}
                              </div>
                            )}
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "paint") {
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow
                            id={id}
                            state={st}
                            details={script?.shots?.[0]?.prompt ?? FALLBACK_PROMPT_DETAIL}
                            detailsLabel="Prompt details"
                            keepChildrenWhenCollapsed
                          >
                            {paintAssets.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {paintAssets.map((a) => (
                                  <AssetCard key={a.id} asset={a} compact />
                                ))}
                              </div>
                            )}
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "qc") {
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow id={id} state={st} keepChildrenWhenCollapsed>
                            <QCPanel />
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "life") {
                      const lowCredit = st.status === "recovering" && remaining < 30;
                      const lifeAssets = assets.filter((a) => a.stageId === "life");
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow
                            id={id}
                            state={st}
                            details={lowCredit ? undefined : RECOVERY_NOTES}
                            detailsLabel="Recovery notes"
                            keepChildrenWhenCollapsed
                          >
                            {lowCredit ? (
                              <InlineLowCredit />
                            ) : lifeAssets.length > 0 ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {lifeAssets.map((a) => (
                                  <AssetCard key={a.id} asset={a} compact />
                                ))}
                              </div>
                            ) : null}
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "details") {
                      const lifeAssets = assets.filter((a) => a.stageId === "life" && a.status === "Ready");
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow id={id} state={st} keepChildrenWhenCollapsed>
                            <div className="space-y-2">
                              <div className="rounded-2xl border border-border bg-surface px-3 py-2.5 text-[12.5px]">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="font-medium">合成完整成片</span>
                                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-accent">
                                    {lifeAssets.length} 段
                                  </span>
                                </div>
                                <div className="text-muted-foreground">
                                  {st.status === "ready"
                                    ? "全部分镜已合并为完整成片。"
                                    : st.status === "running"
                                      ? "正在按时间线拼接所有分镜片段…"
                                      : "等待用户确认后开始合成。"}
                                </div>
                              </div>
                              {st.status === "ready" && <QualityCheck />}
                            </div>
                          </StageRow>
                        </StageBoundary>
                      );
                    }


                    return (
                      <StageBoundary key={id} stageId={id}>
                        <StageRow id={id} state={st} />
                      </StageBoundary>
                    );
                  })}

                  {gate && <ApprovalChips />}

                  {/* In-task chat (merged into main timeline, ChatGPT-style) */}
                  {chatLog.map((m) =>
                    m.role === "user" ? (
                      <div
                        key={m.id}
                        className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px] [animation:stream-fade_280ms_ease-out_both]"
                      >
                        {m.text}
                      </div>
                    ) : (
                      <ChatAgentMessage
                        key={m.id}
                        id={m.id}
                        text={m.text}
                        streaming={m.streaming}
                        toolCalls={m.toolCalls}
                        // Option cards are rendered ABOVE the script — hide them here
                        // so they don't appear twice (once above, once in the chat log).
                        optionCards={undefined}
                        skill={m.skill}
                        actions={m.actions}
                      />
                    ),
                  )}


                  <div ref={endRef} className="h-px" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom command bar (only when not empty) */}
      {phase !== "empty" && (
        <div className="z-10 border-t border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-[760px]">
            <CommandInput compact />
          </div>
        </div>
      )}

      <WorkspaceVersionDrawer />
      <CreateProjectDialog />
      <AssetPreviewDialog />
    </div>
  );
}

function WorkspaceVersionDrawer() {
  const assetId = useSC((s) => s.versionDrawerAssetId);
  const close = useSC((s) => s.closeVersionDrawer);
  const asset = useSC((s) => s.assets.find((a) => a.id === assetId) ?? null);
  return (
    <VersionDrawer
      asset={asset}
      open={!!assetId}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    />
  );
}

function HomeProjectsRow() {
  const projects = useProjects((s) => s.projects);
  const loaded = useProjects((s) => s.loaded);
  const openCreate = useProjects((s) => s.openCreate);
  const navigate = useNavigate();

  if (!loaded) return null;
  const recent = projects.slice(0, 3);

  const onPick = (id: string) => {
    void navigate({ to: "/projects/$projectId", params: { projectId: id } });
  };


  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        我的项目
      </span>
      {recent.map((p) => {
        const Icon = HOME_KIND_ICON[p.kind] ?? FolderIcon;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground/85 transition-colors hover:border-accent/60 hover:bg-accent/10"
          >
            <Icon className="h-3.5 w-3.5 text-accent" />
            <span className="max-w-[140px] truncate">{p.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => openCreate(null)}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-surface/40 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
      >
        <FolderPlusIcon className="h-3.5 w-3.5" />
        {recent.length === 0 ? "创建第一个项目" : "新建项目"}
      </button>
    </div>
  );
}

/**
 * 当用户点击某个项目，但项目尚无本地缓存内容时，在主页顶部显示项目上下文横幅，
 * 提供明确反馈（避免"点了没反应"的错觉）。
 */
function ActiveProjectBanner() {
  const currentProjectId = useProjects((s) => s.currentProjectId);
  const projects = useProjects((s) => s.projects);
  const taskHistory = useSC((s) => s.taskHistory);
  const currentTaskId = useSC((s) => s.taskId);
  const hydrated = useSC((s) => s.hydrated);
  const navigate = useNavigate();
  const proj = projects.find((p) => p.id === currentProjectId) ?? null;
  if (!proj) return null;
  const Icon = HOME_KIND_ICON[proj.kind] ?? FolderIcon;
  const total = hydrated ? taskHistory.filter(
    (t) => (t.projectId === proj.id || (!t.projectId && titleMatchesProject(t.title, proj.name)))
      && t.id !== currentTaskId,
  ).length : 0;

  return (
    <div className="mb-4 rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] px-4 py-3 text-[12.5px] [animation:stream-fade_320ms_ease-out_both]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">
            当前项目 · <span className="text-accent">{proj.name}</span>
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {total === 0
              ? "该项目下暂无历史任务，直接在下方输入需求即可开始第一次创作。"
              : `该项目下共有 ${total} 条历史任务。`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/projects/$projectId", params: { projectId: proj.id } })}
          className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11.5px] text-accent transition-colors hover:bg-accent/20"
        >
          查看项目详情
        </button>
      </div>
    </div>
  );
}





