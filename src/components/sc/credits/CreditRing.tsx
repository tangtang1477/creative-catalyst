import { useEffect, useState } from "react";
import { useCredits } from "@/lib/sc/credits-store";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * SVG ring rendered around an avatar/trigger showing REMAINING credits.
 * Ring starts full and shrinks clockwise as credits are spent.
 * Turns amber at ≤50% remaining and red+pulse at ≤20% remaining.
 * Briefly flashes whenever credits change (consume/topUp bump pulseId).
 */
export function CreditRing({ size = 32, stroke = 2, children, className }: Props) {
  const used = useCredits((s) => s.used);
  const total = useCredits((s) => s.total);
  const pulseId = useCredits((s) => s.pulseId);

  const remaining = Math.max(0, total - used);
  const remainPct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const isLow = remainPct <= 0.5 && remainPct > 0.2;
  const isCritical = remainPct <= 0.2;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * remainPct;

  const color = isCritical
    ? "var(--credit-critical)"
    : isLow
      ? "var(--credit-low)"
      : "var(--accent)";

  // Flash whenever credits change
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (pulseId === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 320);
    return () => window.clearTimeout(t);
  }, [pulseId]);

  const title = `剩余 ${remaining} / 总额度 ${total}（已消耗 ${used}）· 圆环耗尽代表积分用完`;

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
          style={{
            transition:
              "stroke-dasharray 600ms cubic-bezier(0.22, 1, 0.36, 1), stroke 240ms",
            filter: flash
              ? `drop-shadow(0 0 6px ${color})`
              : "drop-shadow(0 0 0 transparent)",
          }}
        />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
