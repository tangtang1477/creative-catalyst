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
  /** 账户总积分（初始 200 + 累计充值）。 */
  total: number;
  /** 累计已消耗积分。 */
  used: number;
  history: CreditEvent[];
  pricingOpen: boolean;
  lowOpen: boolean;
  lowDismissedFor: string | null;
  pulseId: number;
  synced: boolean;
  toppingUp: boolean;
  hydrated: boolean;
  hydrateFromStorage: () => void;
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

/**
 * 圆环视觉满格阈值：当账户余额 ≥ 200 时圆环 100% 闭合；
 * 余额 < 200 时按 余额 / 200 比例展示。仅用于视觉，不参与任何"封顶/已用"计算。
 */
export const RING_FULL_AT = 200;

const DEFAULT_TOTAL = 200;

const load = (): { total: number; used: number; history: CreditEvent[] } => {
  if (typeof window === "undefined") return { total: DEFAULT_TOTAL, used: 0, history: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { total: DEFAULT_TOTAL, used: 0, history: [] };
    const j = JSON.parse(raw);
    const total = typeof j.total === "number" && j.total >= DEFAULT_TOTAL ? j.total : DEFAULT_TOTAL;
    return {
      total,
      used: Math.max(0, j.used ?? 0),
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

// 按 stage 节流：连续多次消耗合并为一条 toast
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
    toast(`本次消耗 ${entry.cost} 积分 · 账户余额 ${Math.max(0, remaining)} 积分`, {
      description: `阶段 · ${stage}`,
      duration: 2500,
    });
  }, 350);
}

export const useCredits = create<CreditsState>((set, get) => {
  return {
    total: DEFAULT_TOTAL,
    used: 0,
    history: [],
    pricingOpen: false,
    lowOpen: false,
    lowDismissedFor: null,
    pulseId: 0,
    synced: false,
    toppingUp: false,
    hydrated: false,

    hydrateFromStorage: () => {
      if (typeof window === "undefined") return;
      const next = load();
      set({ total: next.total, used: next.used, history: next.history, hydrated: true });
    },

    consume: (stage, label, cost, taskId) => {
      if (cost <= 0) return;
      let remainingSnap = 0;
      set((s) => {
        const used = s.used + cost;
        remainingSnap = Math.max(0, s.total - used);
        const history = [
          ...s.history,
          { ts: Date.now(), stage, label, cost, taskId: taskId ?? null },
        ].slice(-20);
        persist({ total: s.total, used, history });
        return { used, history, pulseId: s.pulseId + 1 };
      });
      notifyConsume(stage, cost, remainingSnap);
      if (remainingSnap === 0) {
        set({ lowOpen: true, lowDismissedFor: null });
      } else if (remainingSnap <= 20) {
        if (!taskId || get().lowDismissedFor !== taskId) set({ lowOpen: true });
      }
      void (async () => {
        try {
          const { consumeCredits } = await import("@/lib/credits.functions");
          const r = await consumeCredits({
            data: { taskId: taskId ?? null, stage, label, cost },
          });
          set({ used: r.used, total: r.total, synced: true });
          persist({ total: r.total, used: r.used, history: get().history });
          const rem = Math.max(0, r.total - r.used);
          if (rem === 0) set({ lowOpen: true, lowDismissedFor: null });
          else if (rem <= 20) {
            if (!taskId || get().lowDismissedFor !== taskId) set({ lowOpen: true });
          }
        } catch (err) {
          console.warn("[credits] backend ledger insert failed", err);
        }
      })();
    },

    topUp: async (n, tier) => {
      if (n <= 0) return;
      set((s) => {
        const total = s.total + n;
        persist({ total, used: s.used, history: s.history });
        return { total, lowOpen: false, lowDismissedFor: null, toppingUp: true };
      });
      try {
        const { topUpCredits, getCreditsBalance } = await import("@/lib/credits.functions");
        const r = await topUpCredits({ data: { amount: n, tier } });
        let used = r.used, total = r.total, remaining = r.remaining;
        try {
          const b = await getCreditsBalance();
          used = b.used; total = b.total; remaining = b.remaining;
        } catch { /* ignore */ }
        set({ used, total, synced: true, toppingUp: false, pulseId: get().pulseId + 1 });
        persist({ total, used, history: get().history });
        toast.success(`充值成功 · 到账 ${n} 积分`, {
          description: `账户余额 ${Math.max(0, remaining)} 积分`,
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
        return { used: 0, history: [], pulseId: s.pulseId + 1 };
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
  /** 账户余额（唯一口径）。 */
  remaining: (s: CreditsState) => Math.max(0, s.total - s.used),
  /** 圆环填充比例 0..1：余额 ≥ 200 时为 1。 */
  ringPercent: (s: CreditsState) =>
    Math.max(0, Math.min(1, Math.max(0, s.total - s.used) / RING_FULL_AT)),
};
