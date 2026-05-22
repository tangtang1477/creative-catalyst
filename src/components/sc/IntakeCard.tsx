import { useEffect, useMemo, useState } from "react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { Loader2 } from "lucide-react";
import { inferIntake, OTHERS_LABEL } from "@/lib/sc/intake-engine";
import { OthersChip } from "./OthersChip";
import { cn } from "@/lib/utils";

const titles = {
  adType: "1. 视频类型？",
  format: "2. 投放规格（时长 + 比例）？",
  visualSource: "3. 画面来源？",
  mode: "4. 创作模式？",
} as const;

const shortLabels = {
  adType: "视频类型",
  format: "投放规格",
  visualSource: "画面来源",
  mode: "创作模式",
} as const;

type Key = keyof typeof titles;
const ORDER: Key[] = ["adType", "format", "visualSource", "mode"];

export function IntakeCard() {
  const {
    brief,
    confirmBrief,
    skipIntake,
    intakeSel,
    intakeCustoms,
    setIntakeSel,
  } = useSC();
  const intake = useMemo(
    () => inferIntake(brief?.prompt ?? ""),
    [brief?.prompt],
  );

  // Seed defaults into store once
  useEffect(() => {
    ORDER.forEach((k) => {
      if (!intakeSel[k]) setIntakeSel(k, intake.defaults[k]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake]);

  // Streaming reveal state
  const [phase, setPhase] = useState<"loading" | "stream" | "ready">("loading");
  const [revealedIdx, setRevealedIdx] = useState(-1); // index of last revealed question
  const [titleChars, setTitleChars] = useState<number[]>([0, 0, 0, 0]);
  const [chipCounts, setChipCounts] = useState<number[]>([0, 0, 0, 0]);

  // initial loading
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPhase("stream");
      setRevealedIdx(0);
    }, 1400);
    return () => window.clearTimeout(t);
  }, []);

  // sequentially reveal each question's title (typewriter) then chips
  useEffect(() => {
    if (phase !== "stream" || revealedIdx < 0 || revealedIdx >= ORDER.length) return;
    const key = ORDER[revealedIdx];
    const title = titles[key];
    const opts = (key === "adType"
      ? intake.adType
      : key === "format"
        ? intake.format
        : key === "visualSource"
          ? intake.visualSource
          : intake.mode
    ).filter((o) => o !== OTHERS_LABEL);
    const totalChipCount = opts.length + 1; // +1 for Others chip

    let cancelled = false;
    // type the title
    const typeStep = (i: number) => {
      if (cancelled) return;
      setTitleChars((p) => {
        const n = [...p];
        n[revealedIdx] = i;
        return n;
      });
      if (i < title.length) {
        window.setTimeout(() => typeStep(i + 1), 24);
      } else {
        // then chip stagger
        const chipStep = (j: number) => {
          if (cancelled) return;
          setChipCounts((p) => {
            const n = [...p];
            n[revealedIdx] = j;
            return n;
          });
          if (j < totalChipCount) {
            window.setTimeout(() => chipStep(j + 1), 90);
          } else {
            // gap then next question
            window.setTimeout(() => {
              if (cancelled) return;
              if (revealedIdx + 1 < ORDER.length) {
                setRevealedIdx((r) => r + 1);
              } else {
                setPhase("ready");
              }
            }, 520);
          }
        };
        window.setTimeout(() => chipStep(1), 220);
      }
    };
    typeStep(1);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealedIdx]);

  const onContinue = () => {
    confirmBrief({
      prompt: brief?.prompt ?? "",
      adType: intakeSel.adType,
      format: intakeSel.format,
      visualSource: intakeSel.visualSource,
      mode: intakeSel.mode,
    });
  };

  return (
    <div className="space-y-4 [animation:stream-fade_320ms_ease-out_both]">
      <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px]">
        {brief?.prompt}
      </div>

      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        {phase === "loading" ? (
          <div className="flex items-center gap-2 py-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            正在分析你的 brief…
          </div>
        ) : (
          <div className="text-[13px] text-foreground/85">{intake.greeting}</div>
        )}

        <div className="mt-4 space-y-4">
          {ORDER.map((key, idx) => {
            if (idx > revealedIdx) return null;
            const opts = (key === "adType"
              ? intake.adType
              : key === "format"
                ? intake.format
                : key === "visualSource"
                  ? intake.visualSource
                  : intake.mode
            ).filter((o) => o !== OTHERS_LABEL);
            const allOpts = [...opts, ...(intakeCustoms[key] ?? [])];
            const titleSliced = titles[key].slice(0, titleChars[idx]);
            const cc = chipCounts[idx];

            return (
              <div key={key}>
                <div className="text-[12.5px] font-medium text-foreground/90">
                  {titleSliced}
                  {titleChars[idx] < titles[key].length && (
                    <span className="ml-0.5 inline-block h-3 w-[2px] -translate-y-[1px] animate-pulse bg-accent align-middle" />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {allOpts.map((opt, i) => (
                    <div
                      key={opt}
                      className={cn(
                        "transition-all duration-300",
                        i < cc
                          ? "translate-y-0 opacity-100"
                          : "pointer-events-none -translate-y-1 opacity-0",
                      )}
                    >
                      <SCButton
                        variant="chip"
                        size="sm"
                        selected={intakeSel[key] === opt}
                        onClick={() => setIntakeSel(key, opt)}
                      >
                        {opt}
                      </SCButton>
                    </div>
                  ))}
                  <div
                    className={cn(
                      "transition-all duration-300",
                      cc > allOpts.length
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none -translate-y-1 opacity-0",
                    )}
                  >
                    <OthersChip questionKey={key} questionLabel={shortLabels[key]} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {phase === "ready" && (
          <div className="mt-5 flex items-center justify-end gap-2 [animation:stream-fade_320ms_ease-out_both]">
            <SCButton variant="ghost" size="sm" onClick={skipIntake}>
              Skip
            </SCButton>
            <SCButton variant="primary" size="sm" onClick={onContinue}>
              Continue
              <span className="ml-1 text-[10px] opacity-70">⌘ ⏎</span>
            </SCButton>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        Awaiting your input
      </div>
    </div>
  );
}
