import { useEffect, useRef, useState } from "react";
import { useSC } from "@/lib/sc/store";
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
import { PricingDialog } from "./credits/PricingDialog";
import { LowCreditToast } from "./credits/LowCreditToast";
import { InlineLowCredit } from "./credits/InlineLowCredit";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { StageBoundary } from "./StageBoundary";
import { VersionDrawer } from "./VersionDrawer";
import { ChatAgentMessage } from "./ChatAgentMessage";

import { cn } from "@/lib/utils";

export function Workspace() {
  const { phase, taskTitle, brief, stages, assets, gate, rail, setRailOpen, viewMode, chatLog } = useSC();
  const script = useSC((s) => s.script);
  const retryStage = useSC((s) => s.retryStage);
  const submit = useSC((s) => s.submit);
  const openPricing = useCredits((s) => s.openPricing);
  const remaining = useCredits(creditsSelectors.remaining);
  const paintAssets = assets.filter((a) => a.stageId === "paint");
  const v01 = assets.find((a) => a.id === "V01");
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

                  {brief?.prompt && (
                    <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px]">
                      {brief.prompt}
                    </div>
                  )}

                  {brief && brief.adType && (
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

                  <SeriesBible />

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
                            ) : (
                              v01 && <AssetCard asset={v01} />
                            )}
                          </StageRow>
                        </StageBoundary>
                      );
                    }

                    if (id === "details" && st.status === "ready") {
                      return (
                        <StageBoundary key={id} stageId={id}>
                          <StageRow id={id} state={st} keepChildrenWhenCollapsed>
                            <QualityCheck />
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

      <PricingDialog />
      <LowCreditToast />
      <WorkspaceVersionDrawer />
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

