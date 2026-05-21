import { Check } from "lucide-react";
import { SCButton } from "./Button";

const checks = [
  "9:16 比例",
  "产品可见",
  "无违规宣称",
  "媒体链接已验证",
];

const next = ["A/B variant", "字幕/旁白", "封面图", "改节奏", "比例导出"];

export function QualityCheck() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <div
            key={c}
            className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px]"
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
