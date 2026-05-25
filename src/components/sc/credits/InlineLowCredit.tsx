import { useCredits, creditsSelectors } from "@/lib/sc/credits-store";
import { LowCreditPill } from "./LowCreditPill";

/**
 * Inline variant rendered inside the `life` stage row when the user does not
 * have enough credits to start the video integration.
 */
export function InlineLowCredit() {
  const openPricing = useCredits((s) => s.openPricing);
  const remaining = useCredits(creditsSelectors.remaining);

  return (
    <LowCreditPill
      variant="inline"
      message={`仅剩 ${remaining} · 无法继续渲染`}
      onTopUp={openPricing}
    />
  );
}
