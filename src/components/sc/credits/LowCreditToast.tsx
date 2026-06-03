import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { useSC } from "@/lib/sc/store";
import { LowCreditPill } from "./LowCreditPill";

export function LowCreditToast() {
  const open = useCredits((s) => s.lowOpen);
  const closeLow = useCredits((s) => s.closeLow);
  const openPricing = useCredits((s) => s.openPricing);
  const remaining = useCredits(creditsSelectors.remaining);
  const hydrated = useCredits((s) => s.hydrated);
  const taskId = useSC((s) => s.taskId);

  if (!open || !hydrated) return null;
  const message =
    remaining > 0 ? `账户余额仅剩 ${remaining} 积分` : `账户余额已耗尽 · 无法继续渲染`;

  return (
    <LowCreditPill
      variant="toast"
      message={message}
      onTopUp={openPricing}
      onClose={() => closeLow(taskId ?? undefined)}
    />
  );
}
