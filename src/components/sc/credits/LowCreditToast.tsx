import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { useSC } from "@/lib/sc/store";
import { LowCreditPill } from "./LowCreditPill";

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
  const message =
    remaining > 0 ? `Over ${pct}% already used` : `仅剩 ${remaining} · 无法继续渲染`;

  return (
    <LowCreditPill
      variant="toast"
      message={message}
      onTopUp={openPricing}
      onClose={() => closeLow(taskId ?? undefined)}
    />
  );
}
