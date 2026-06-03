import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";

export function CreditsHoverPanel({ onTopUp }: { onTopUp: () => void }) {
  const remaining = useCredits(creditsSelectors.remaining);
  const ringPct = useCredits(creditsSelectors.ringPercent);
  const pulseId = useCredits((s) => s.pulseId);
  const history = useCredits((s) => s.history);

  // 动画计数 — 跟踪账户余额
  const [display, setDisplay] = useState(remaining);
  const fromRef = useRef(remaining);
  useEffect(() => {
    const from = fromRef.current;
    const to = remaining;
    if (from === to) return;
    const start = performance.now();
    const dur = 500;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const v = Math.round(from + (to - from) * k);
      setDisplay(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [remaining]);

  const DOTS = 20;
  // 圆点按圆环比例填充，余额 ≥ 200 时全部亮起
  const filled = Math.round(ringPct * DOTS);

  const [flashDot, setFlashDot] = useState<number | null>(null);
  useEffect(() => {
    if (pulseId === 0) return;
    setFlashDot(filled);
    const t = window.setTimeout(() => setFlashDot(null), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseId]);

  const recent = history.slice(-3).reverse();

  return (
    <div className="mt-2 rounded-xl bg-surface-2/60 px-3 py-2.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium">账户余额</span>
        <button
          onClick={onTopUp}
          className="text-muted-foreground transition-colors hover:text-accent"
        >
          <span className="tabular-nums">{display}</span> 积分 ›
        </button>
      </div>
      <div className="mt-2 flex gap-[3px]">
        {Array.from({ length: DOTS }).map((_, i) => {
          const isFilled = i < filled;
          const isFlash = i === flashDot;
          return (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                isFilled ? "bg-accent" : "bg-border",
                isFlash && "animate-[credit-deplete_700ms_ease-out]",
              )}
            />
          );
        })}
      </div>
      {recent.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {recent.map((e) => (
            <div
              key={e.ts}
              className="flex items-center justify-between text-[10.5px] text-muted-foreground [animation:stream-fade_320ms_ease-out_both]"
            >
              <span className="truncate">{e.label}</span>
              <span className="ml-2 shrink-0 tabular-nums text-status-failed">
                −{e.cost}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
