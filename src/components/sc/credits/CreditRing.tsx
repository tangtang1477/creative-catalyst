import { useEffect, useState } from "react";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * 圆环只反映账户余额：
 *   - 余额 ≥ 200 → 100% 闭合
 *   - 余额 < 200 → 按 余额 / 200 比例展示
 */
export function CreditRing({ size = 32, stroke = 2, children, className }: Props) {
  const remaining = useCredits(creditsSelectors.remaining);
  const ringPct = useCredits(creditsSelectors.ringPercent);
  const pulseId = useCredits((s) => s.pulseId);

  const isCritical = remaining <= 20;
  const isLow = !isCritical && remaining <= 50;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * ringPct;

  const color = isCritical
    ? "var(--credit-critical)"
    : isLow
      ? "var(--credit-low)"
      : "var(--accent)";

  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (pulseId === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 320);
    return () => window.clearTimeout(t);
  }, [pulseId]);

  const title = `账户余额 ${remaining} 积分`;

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
