import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { useSC } from "@/lib/sc/store";

export function LowCreditToast() {
  const open = useCredits((s) => s.lowOpen);
  const closeLow = useCredits((s) => s.closeLow);
  const openPricing = useCredits((s) => s.openPricing);
  const used = useCredits((s) => s.used);
  const total = useCredits((s) => s.total);
  const remaining = useCredits(creditsSelectors.remaining);
  const taskId = useSC((s) => s.taskId);

  if (!open) return null;
  const pct = Math.round((used / total) * 100);

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-5 right-5 z-50 flex w-[440px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-border bg-background/95 py-2 pl-3 pr-2 shadow-2xl backdrop-blur",
        "[animation:stream-fade_360ms_ease-out_both]",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--credit-low)_25%,transparent)]">
        <span
          className="h-3 w-3 rotate-45 rounded-[2px]"
          style={{ background: "var(--credit-low)" }}
        />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <span className="font-medium text-foreground">Credits are running low</span>
        <span className="ml-1.5 text-muted-foreground">
          {remaining > 0 ? `Over ${pct}% already used` : `仅剩 ${remaining} · 无法继续渲染`}
        </span>
      </div>
      <button
        onClick={() => {
          openPricing();
        }}
        className="rounded-full bg-background px-4 py-1.5 text-[12px] font-semibold text-foreground shadow ring-1 ring-border transition-all hover:ring-accent/60 hover:text-accent"
      >
        Top Up
      </button>
      <button
        onClick={() => closeLow(taskId ?? undefined)}
        aria-label="dismiss"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
