import { Check } from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { detectVideoType, NEXT_CHIPS } from "@/lib/sc/video-types";

const checks = [
  "比例 & 时长匹配",
  "主体/角色一致",
  "无未支持声明",
  "媒体链接已验证",
];

export function QualityCheck() {
  const { brief } = useSC();
  const type = detectVideoType(brief?.prompt ?? "", brief?.adType);
  const next = NEXT_CHIPS[type];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <div
            key={c}
            className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5 text-[12px]"
          >
            <Check className="h-3.5 w-3.5 text-status-ready" />
            {c}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <span className="self-center text-[11.5px] text-muted-foreground">
          Next:
        </span>
        {next.map((n) => (
          <SCButton key={n} variant="chip" size="sm">
            {n}
          </SCButton>
        ))}
      </div>
    </div>
  );
}
