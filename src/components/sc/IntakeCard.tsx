import { useState } from "react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { Loader2 } from "lucide-react";

const groups = [
  {
    key: "adType" as const,
    title: "1. 你想要哪种风格的广告？",
    options: [
      "Problem-Solution（15s，旁白叙述）",
      "Lifestyle（15s，主角出镜说话）",
      "High Energy（15s，动感节奏 + 标语主导）",
      "Other",
    ],
    default: "Lifestyle（15s，主角出镜说话）",
  },
  {
    key: "visualSource" as const,
    title: "2. 你有产品图片或品牌URL吗？",
    options: ["上传产品图片", "粘贴产品/品牌URL", "自动生成一张香水棚拍图", "Other"],
    default: "上传产品图片",
  },
  {
    key: "format" as const,
    title: "3. 广告的主角人物如何确定？",
    options: ["上传人物照片", "根据脚本自动生成匹配角色", "Other"],
    default: "根据脚本自动生成匹配角色",
  },
  {
    key: "mode" as const,
    title: "4. 有什么具体的场景或创意想法吗？（选填，留空则全自动发挥）",
    options: ["我有想法，我来描述", "全自动发挥，给我惊喜", "Other"],
    default: "全自动发挥，给我惊喜",
  },
];

export function IntakeCard() {
  const { brief, confirmBrief, skipIntake } = useSC();
  const [sel, setSel] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.default])),
  );

  const onContinue = () => {
    confirmBrief({
      prompt: brief?.prompt ?? "",
      adType: sel.adType,
      format: sel.format,
      visualSource: sel.visualSource,
      mode: sel.mode,
    });
  };

  return (
    <div className="space-y-4">
      <div className="ml-auto w-fit max-w-[80%] rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
        {brief?.prompt}
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-4">
        <div className="text-[13px] text-foreground/85">
          好的，我来帮你制作一支{brief?.prompt ?? "广告片"}，按照下流程，先确认几个关键信息：
        </div>

        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="text-[12.5px] font-medium text-foreground/90">
                {g.title}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {g.options.map((opt) => (
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
              </div>
            </div>
          ))}
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
