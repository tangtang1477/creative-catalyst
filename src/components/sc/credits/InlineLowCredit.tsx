import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { LowCreditPill } from "./LowCreditPill";

/**
 * Inline variant rendered inside the `life` stage row when the user does not
 * have enough credits to start the video integration.
 */
export function InlineLowCredit() {
  const openPricing = useCredits((s) => s.openPricing);
  const remaining = useCredits(creditsSelectors.remaining);
  const hydrated = useCredits((s) => s.hydrated);

  return (
    <LowCreditPill
      variant="inline"
      message={hydrated ? `仅剩 ${remaining} · 无法继续渲染` : "积分不足 · 无法继续渲染"}
      onTopUp={openPricing}
    />
  );
}
