import { create } from "zustand";
import { toast } from "sonner";

export interface CreditEvent {
  ts: number;
  stage: string;
  label: string;
  cost: number;
  taskId?: string | null;
}

interface CreditsState {
  total: number;
  used: number;
  history: CreditEvent[];
  pricingOpen: boolean;
  lowOpen: boolean;
  lowDismissedFor: string | null; // taskId user dismissed for
  pulseId: number;
  synced: boolean;
  toppingUp: boolean;
  consume: (stage: string, label: string, cost: number, taskId?: string | null) => void;
  topUp: (n: number, tier?: string) => Promise<void>;
  resetUsed: () => void;
  canAfford: (cost: number) => boolean;
  openPricing: () => void;
  closePricing: () => void;
  openLow: (taskId?: string) => void;
  closeLow: (taskId?: string) => void;
  syncFromBackend: () => Promise<void>;
}

const KEY = "sc.credits.v1";

const DEFAULT_TOTAL = 200;

const load = (): { total: number; used: number; history: CreditEvent[] } => {
  if (typeof window === "undefined") return { total: DEFAULT_TOTAL, used: 0, history: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { total: DEFAULT_TOTAL, used: 0, history: [] };
    const j = JSON.parse(raw);
    // Migration: legacy mock data had total=100/used=42. Force-upgrade to 200.
    const total = (j.total ?? 0) < DEFAULT_TOTAL ? DEFAULT_TOTAL : j.total;
    return {
      total,
      used: Math.min(j.used ?? 0, total),
      history: Array.isArray(j.history) ? j.history.slice(-20) : [],
    };
  } catch {
    return { total: DEFAULT_TOTAL, used: 0, history: [] };
  }
};

const persist = (s: { total: number; used: number; history: CreditEvent[] }) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ total: s.total, used: s.used, history: s.history.slice(-20) }),
    );
  } catch {
    /* ignore */
  }
};

// Per-stage debounce so batch generators (8 keyframes in a row) don't
// produce 8 stacked toasts. We aggregate the cost within 350ms.
const toastBuffer = new Map<string, { cost: number; timer: ReturnType<typeof setTimeout> }>();
function notifyConsume(stage: string, cost: number, remaining: number) {
  if (typeof window === "undefined") return;
  const existing = toastBuffer.get(stage);
  if (existing) {
    clearTimeout(existing.timer);
    existing.cost += cost;
  }
  const entry = existing ?? { cost, timer: null as unknown as ReturnType<typeof setTimeout> };
  if (!existing) toastBuffer.set(stage, entry);
  entry.timer = setTimeout(() => {
    toastBuffer.delete(stage);
    toast(`本次消耗 ${entry.cost} 积分 · 剩余 ${Math.max(0, remaining)} 积分`, {
      description: `阶段 · ${stage}`,
      duration: 2500,
    });
  }, 350);
}

export const useCredits = create<CreditsState>((set, get) => {
  const init = load();
  return {
    total: init.total,
    used: init.used,
    history: init.history,
    pricingOpen: false,
    lowOpen: false,
    lowDismissedFor: null,
    pulseId: 0,
    synced: false,
    toppingUp: false,

    consume: (stage, label, cost, taskId) => {
      if (cost <= 0) return;
      let snapshotRemaining = 0;
      set((s) => {
        const used = Math.min(s.total, s.used + cost);
        snapshotRemaining = Math.max(0, s.total - used);
        const history = [
          ...s.history,
          { ts: Date.now(), stage, label, cost, taskId: taskId ?? null },
        ].slice(-20);
        persist({ total: s.total, used, history });
        return { used, history, pulseId: s.pulseId + 1 };
      });
      notifyConsume(stage, cost, snapshotRemaining);
      // Auto-trigger low-credit prompt
      const tTotal = get().total;
      if (snapshotRemaining === 0) {
        set({ lowOpen: true, lowDismissedFor: null });
      } else if (tTotal > 0 && snapshotRemaining / tTotal <= 0.1) {
        if (!taskId || get().lowDismissedFor !== taskId) set({ lowOpen: true });
      }
      // Backend ledger insert (best-effort)
      void (async () => {
        try {
          const { consumeCredits } = await import("@/lib/credits.functions");
          const r = await consumeCredits({
            data: { taskId: taskId ?? null, stage, label, cost },
          });
          set({ used: r.used, total: r.total, synced: true });
          persist({ total: r.total, used: r.used, history: get().history });
          if (r.remaining === 0) set({ lowOpen: true, lowDismissedFor: null });
          else if (r.total > 0 && r.remaining / r.total <= 0.1) {
            if (!taskId || get().lowDismissedFor !== taskId) set({ lowOpen: true });
          }
        } catch (err) {
          console.warn("[credits] backend ledger insert failed", err);
        }
      })();
    },

    topUp: async (n, tier) => {
      if (n <= 0) return;
      // Optimistic update
      set((s) => {
        const total = s.total + n;
        persist({ total, used: s.used, history: s.history });
        return { total, lowOpen: false, lowDismissedFor: null, toppingUp: true };
      });
      try {
        const { topUpCredits, getCreditsBalance } = await import("@/lib/credits.functions");
        const r = await topUpCredits({ data: { amount: n, tier } });
        // Re-sync to be safe (covers race with concurrent consume rows).
        let used = r.used, total = r.total, remaining = r.remaining;
        try {
          const b = await getCreditsBalance();
          used = b.used; total = b.total; remaining = b.remaining;
        } catch { /* ignore */ }
        set({ used, total, synced: true, toppingUp: false, pulseId: get().pulseId + 1 });
        persist({ total, used, history: get().history });
        toast.success(`充值成功 · 到账 ${n} 积分`, {
          description: `当前余额 ${Math.max(0, remaining)} · 总额度 ${total}`,
          duration: 3000,
        });
      } catch (err) {
        console.warn("[credits] backend topup failed", err);
        set({ toppingUp: false });
        toast.error("充值失败，请稍后重试");
      }
    },

    resetUsed: () =>
      set((s) => {
        persist({ total: s.total, used: 0, history: [] });
        return { used: 0, history: [] };
      }),
    canAfford: (cost) => get().total - get().used >= cost,
    openPricing: () => set({ pricingOpen: true }),
    closePricing: () => set({ pricingOpen: false }),
    openLow: (taskId) => {
      if (taskId && get().lowDismissedFor === taskId) return;
      set({ lowOpen: true });
    },
    closeLow: (taskId) =>
      set({ lowOpen: false, lowDismissedFor: taskId ?? get().lowDismissedFor }),

    syncFromBackend: async () => {
      try {
        const { getCreditsBalance } = await import("@/lib/credits.functions");
        const r = await getCreditsBalance();
        set({ used: r.used, total: r.total, synced: true });
        persist({ total: r.total, used: r.used, history: get().history });
      } catch (err) {
        console.warn("[credits] backend balance fetch failed", err);
      }
    },
  };
});

export const creditsSelectors = {
  remaining: (s: CreditsState) => Math.max(0, s.total - s.used),
  percent: (s: CreditsState) => Math.min(100, Math.round((s.used / s.total) * 100)),
  remainingPercent: (s: CreditsState) =>
    Math.max(0, Math.min(100, Math.round(((s.total - s.used) / s.total) * 100))),
};
