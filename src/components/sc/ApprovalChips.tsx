import { Check, RotateCw, Pencil } from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";

export function ApprovalChips() {
  const { gate, approveScript, tweakScript, approveKeyframe, regenerateKeyframe } =
    useSC();

  if (!gate) return null;

  if (gate === "script") {
    return (
      <div className="flex items-center gap-1.5 rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] px-3 py-2">
        <span className="text-[12px] text-foreground/85">脚本与分镜已就绪，是否继续？</span>
        <div className="ml-auto flex items-center gap-1.5">
          <SCButton variant="chip" size="sm" onClick={tweakScript}>
            <Pencil className="h-3 w-3" />
            Tweak
          </SCButton>
          <SCButton variant="primary" size="sm" onClick={approveScript}>
            <Check className="h-3.5 w-3.5" />
            Approve & continue
          </SCButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] px-3 py-2">
      <span className="text-[12px] text-foreground/85">A01 Keyframe 已就绪，是否用作 V01 起始帧？</span>
      <div className="ml-auto flex items-center gap-1.5">
        <SCButton variant="chip" size="sm" onClick={regenerateKeyframe}>
          <RotateCw className="h-3 w-3" />
          Regenerate
        </SCButton>
        <SCButton variant="primary" size="sm" onClick={approveKeyframe}>
          <Check className="h-3.5 w-3.5" />
          Use this keyframe
        </SCButton>
      </div>
    </div>
  );
}
