import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  className?: string;
}

/**
 * 右下叠加的小型「生成中」徽标 —— 与 StageThinkingPill 同一视觉语言。
 * 用于流式图片生成时在 partial preview 上保留可见的状态提示。
 */
export function GeneratingPill({ label = "Generating", className }: Props) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-1.5 right-1.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm",
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {label}
    </span>
  );
}
