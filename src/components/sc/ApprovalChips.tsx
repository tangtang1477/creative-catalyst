import { useEffect, useState } from "react";
import { Check, RotateCw, Pencil, X, Timer, Film } from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

export function ApprovalChips() {
  const {
    gate,
    softGate,
    approveScript,
    tweakScript,
    approveWardrobe,
    tweakWardrobe,
    approveKeyframe,
    regenerateKeyframe,
    applyQCFix,
    keepAsIs,
    cancelSoftGate,
  } = useSC();

  // tick for countdown
  const [, force] = useState(0);
  useEffect(() => {
    if (!softGate) return;
    const t = window.setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [softGate]);

  if (!gate) return null;

  const remaining = softGate
    ? Math.max(0, Math.ceil((softGate.fireAt - Date.now()) / 1000))
    : 0;

  const variants: Record<
    NonNullable<typeof gate>,
    {
      tip: string;
      secondaryLabel: string;
      secondaryIcon: typeof Pencil;
      secondaryAction: () => void;
      primaryLabel: string;
      primaryAction: () => void;
    }
  > = {
    script: {
      tip: "脚本与分镜已就绪，是否继续？",
      secondaryLabel: "Tweak",
      secondaryIcon: Pencil,
      secondaryAction: tweakScript,
      primaryLabel: "Approve & continue",
      primaryAction: approveScript,
    },
    wardrobe: {
      tip: "服装/道具已就绪，是否符合年代/世界观？",
      secondaryLabel: "重新生成",
      secondaryIcon: RotateCw,
      secondaryAction: tweakWardrobe,
      primaryLabel: "采纳并继续",
      primaryAction: approveWardrobe,
    },
    keyframe: {
      tip: "A01 Keyframe 已就绪，是否用作 V01 起始帧？",
      secondaryLabel: "Regenerate",
      secondaryIcon: RotateCw,
      secondaryAction: regenerateKeyframe,
      primaryLabel: "Use this keyframe",
      primaryAction: approveKeyframe,
    },
    "qc-fix": {
      tip: "自查发现 1 处问题，是否按建议调整？(快模型 · 0 credits)",
      secondaryLabel: "保持原样",
      secondaryIcon: X,
      secondaryAction: keepAsIs,
      primaryLabel: "按建议调整",
      primaryAction: applyQCFix,
    },
  };

  const v = variants[gate];

  return (
    <div className="space-y-2 rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] px-3 py-2.5 [animation:stream-fade_320ms_ease-out_both]">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-foreground/85">{v.tip}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <SCButton variant="chip" size="sm" onClick={v.secondaryAction}>
            <v.secondaryIcon className="h-3 w-3" />
            {v.secondaryLabel}
          </SCButton>
          <SCButton variant="primary" size="sm" onClick={v.primaryAction}>
            <Check className="h-3.5 w-3.5" />
            {v.primaryLabel}
          </SCButton>
        </div>
      </div>
      {softGate && remaining > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Timer className={cn("h-3 w-3", remaining <= 5 && "text-accent animate-pulse")} />
          <span>
            {remaining}s 后将自动按推荐继续 ·
          </span>
          <button
            type="button"
            onClick={cancelSoftGate}
            className="text-accent hover:underline"
          >
            我要确认（取消倒计时）
          </button>
        </div>
      )}
    </div>
  );
}
