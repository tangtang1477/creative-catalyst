import { useSC } from "@/lib/sc/store";
import { CommandInput } from "./CommandInput";
import { SuggestionChips } from "./SuggestionChips";
import { IntakeCard } from "./IntakeCard";
import { StageRow } from "./StageRow";
import { ScriptTable, StoryboardTable } from "./ScriptTable";
import { AssetCard } from "./AssetCard";
import { QualityCheck } from "./QualityCheck";
import { STAGE_ORDER } from "@/lib/sc/types";
import { KEYFRAME_PROMPT_DETAIL, RECOVERY_NOTES } from "@/lib/sc/samples";
import { SCButton } from "./Button";
import { Sparkles, Calendar, GalleryHorizontal, Zap } from "lucide-react";

export function Workspace() {
  const { phase, taskTitle, brief, stages, assets } = useSC();
  const a01 = assets.find((a) => a.id === "A01");
  const v01 = assets.find((a) => a.id === "V01");

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          {phase === "empty" ? (
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-status-ready" />
              Claude, GPT, and Gemini consume credits
            </span>
          ) : (
            <span className="text-foreground">{taskTitle}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <SCButton variant="ghost" size="sm" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Buy credits
          </SCButton>
          {phase !== "empty" && (
            <>
              <SCButton variant="ghost" size="sm" className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Scheduled
              </SCButton>
              <SCButton variant="ghost" size="sm" className="gap-1.5">
                <GalleryHorizontal className="h-3.5 w-3.5" />
                Gallery
              </SCButton>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-6 py-6">
          {phase === "empty" && (
            <div className="flex flex-1 flex-col justify-center pb-20">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 ring-1 ring-border-strong">
                  <Sparkles className="h-5 w-5 text-status-ready" />
                </div>
                <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  Kai, what are we creating today?
                </h1>
              </div>
              <CommandInput placeholder="做一个香奈儿香水的广告" />
              <div className="mt-4">
                <SuggestionChips />
              </div>
            </div>
          )}

          {phase === "intake" && (
            <div className="flex-1 space-y-4">
              <IntakeCard />
            </div>
          )}

          {(phase === "running" || phase === "done" || phase === "failed") && (
            <div className="flex-1 space-y-3">
              {/* User bubble */}
              {brief?.prompt && (
                <div className="ml-auto w-fit max-w-[80%] rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                  {brief.prompt}
                </div>
              )}

              {brief && brief.adType && (
                <div className="rounded-lg border border-border bg-surface px-3.5 py-3 text-[12.5px]">
                  <div className="mb-1.5 font-medium">Selected Brief</div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>· Ad type: {brief.adType}</li>
                    <li>· Format: {brief.format}</li>
                    <li>· Visual: {brief.visualSource}</li>
                    <li>· Mode: {brief.mode}</li>
                  </ul>
                </div>
              )}

              {STAGE_ORDER.map((id) => {
                const st = stages[id];
                if (st.status === "pending") return null;

                if (id === "structure" && st.status === "ready") {
                  return (
                    <StageRow
                      key={id}
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
                  );
                }

                if (id === "paint") {
                  return (
                    <StageRow
                      key={id}
                      id={id}
                      state={st}
                      details={KEYFRAME_PROMPT_DETAIL}
                      detailsLabel="Prompt details"
                    >
                      {a01 && <AssetCard asset={a01} />}
                    </StageRow>
                  );
                }

                if (id === "life") {
                  return (
                    <StageRow
                      key={id}
                      id={id}
                      state={st}
                      details={RECOVERY_NOTES}
                      detailsLabel="Recovery notes"
                    >
                      {v01 && <AssetCard asset={v01} />}
                    </StageRow>
                  );
                }

                if (id === "details" && st.status === "ready") {
                  return (
                    <StageRow key={id} id={id} state={st}>
                      <QualityCheck />
                    </StageRow>
                  );
                }

                return <StageRow key={id} id={id} state={st} />;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom command bar (only when not empty) */}
      {phase !== "empty" && (
        <div className="border-t border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-[760px]">
            <CommandInput compact />
          </div>
        </div>
      )}
    </div>
  );
}
