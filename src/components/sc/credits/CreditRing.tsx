import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * SVG ring rendered around an avatar/trigger showing remaining credits ratio.
 * Color shifts to amber when <20% and red+pulse when <10%.
 */
export function CreditRing({ size = 32, stroke = 2, children, className }: Props) {
  const remaining = useCredits(creditsSelectors.remaining);
  const total = useCredits((s) => s.total);
  const pct = total > 0 ? remaining / total : 0;
  const isLow = pct <= 0.2;
  const isCritical = pct <= 0.1;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  const color = isCritical
    ? "var(--credit-critical)"
    : isLow
      ? "var(--credit-low)"
      : "var(--accent)";

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
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
