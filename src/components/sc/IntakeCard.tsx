import { useMemo, useState } from "react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { Loader2 } from "lucide-react";
import { inferIntake, OTHERS_LABEL } from "@/lib/sc/intake-engine";
import { OthersChip } from "./OthersChip";

const titles = {
  adType: "1. 你想要哪种风格的广告？",
  format: "2. 视频比例与时长？",
  visualSource: "3. 视觉素材从哪里来？",
  mode: "4. 推进模式？",
} as const;

type Key = keyof typeof titles;

export function IntakeCard() {
  const { brief, confirmBrief, skipIntake } = useSC();
  const intake = useMemo(
    () => inferIntake(brief?.prompt ?? ""),
    [brief?.prompt],
  );

  const [sel, setSel] = useState<Record<Key, string>>({
    adType: intake.defaults.adType,
    format: intake.defaults.format,
    visualSource: intake.defaults.visualSource,
    mode: intake.defaults.mode,
  });

  const [customs, setCustoms] = useState<Record<Key, string[]>>({
    adType: [],
    format: [],
    visualSource: [],
    mode: [],
  });

  const onContinue = () => {
    confirmBrief({
      prompt: brief?.prompt ?? "",
      adType: sel.adType,
      format: sel.format,
      visualSource: sel.visualSource,
      mode: sel.mode,
    });
  };

  const groups: { key: Key; options: string[] }[] = [
    { key: "adType", options: intake.adType },
    { key: "format", options: intake.format },
    { key: "visualSource", options: intake.visualSource },
    { key: "mode", options: intake.mode },
  ];

  return (
    <div className="space-y-4 [animation:stream-fade_320ms_ease-out_both]">
      <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[13px]">
        {brief?.prompt}
      </div>

      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        <div className="text-[13px] text-foreground/85">{intake.greeting}</div>

        <div className="mt-4 space-y-4">
          {groups.map((g) => {
            const baseOpts = g.options.filter((o) => o !== OTHERS_LABEL);
            const allOpts = [...baseOpts, ...customs[g.key]];
            return (
              <div key={g.key}>
                <div className="text-[12.5px] font-medium text-foreground/90">
                  {titles[g.key]}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {allOpts.map((opt) => (
                    <SCButton
                      key={opt}
                      variant="chip"
                      size="sm"
                      selected={sel[g.key] === opt}
                      onClick={() => setSel((p) => ({ ...p, [g.key]: opt }))}
                    >
                      {opt}
                    </SCButton>
                  ))}
                  <OthersChip
                    onConfirm={(v) => {
                      setCustoms((p) => ({ ...p, [g.key]: [...p[g.key], v] }));
                      setSel((p) => ({ ...p, [g.key]: v }));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <SCButton variant="ghost" size="sm" onClick={skipIntake}>
            Skip
          </SCButton>
          <SCButton variant="primary" size="sm" onClick={onContinue}>
            Continue
            <span className="ml-1 text-[10px] opacity-70">⌘ ⏎</span>
          </SCButton>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        Awaiting your input
      </div>
    </div>
  );
}
