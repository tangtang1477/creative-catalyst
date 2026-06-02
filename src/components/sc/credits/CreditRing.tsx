import { useCredits } from "@/lib/sc/credits-store";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * SVG ring rendered around an avatar/trigger showing CONSUMPTION progress.
 * Ring fills clockwise as credits are spent. Turns amber at ≥50% used and
 * red+pulse at ≥80% used.
 */
export function CreditRing({ size = 32, stroke = 2, children, className }: Props) {
  const used = useCredits((s) => s.used);
  const total = useCredits((s) => s.total);
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const isLow = pct >= 0.5;
  const isCritical = pct >= 0.8;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  const color = isCritical
    ? "var(--credit-critical)"
    : isLow
      ? "var(--credit-low)"
      : "var(--accent)";

  const remaining = Math.max(0, total - used);
  const title = `已消耗 ${used} / 总额度 ${total}（剩余 ${remaining}）· 圆环合上代表用完 ${total} 积分`;

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      title={title}
    >
      <svg
        className={cn(
          "absolute inset-0 -rotate-90",
          isCritical && "animate-[credit-pulse_1.4s_ease-in-out_infinite]",
        )}
        width={size}
        height={size}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22, 1, 0.36, 1), stroke 240ms" }}
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
