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
  /** 账户总积分（含充值）。仅用于 hover 面板的账户余额展示。 */
  total: number;
  /** 已消耗积分。 */
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

/**
 * 任务额度（固定 200）：圆环 / 进度条都按这 200 计算。
 * 账户总积分（total，可能含充值）单独展示在 hover 面板，不参与圆环闭合判断。
 */
export const QUOTA = 200;

const DEFAULT_TOTAL = QUOTA;

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

// Per-stage debounce so batch generators (8 keyframes in a row) don't
// produce 8 stacked toasts. We aggregate the cost within 350ms.
const toastBuffer = new Map<string, { cost: number; timer: ReturnType<typeof setTimeout> }>();
function notifyConsume(stage: string, cost: number, quotaRemaining: number) {
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
    toast(`本次消耗 ${entry.cost} 积分 · 任务额度剩余 ${Math.max(0, quotaRemaining)} / ${QUOTA}`, {
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
      let quotaRemainingSnap = 0;
      set((s) => {
        const used = s.used + cost;
        const quotaUsed = Math.min(QUOTA, used);
        quotaRemainingSnap = Math.max(0, QUOTA - quotaUsed);
        const history = [
          ...s.history,
          { ts: Date.now(), stage, label, cost, taskId: taskId ?? null },
        ].slice(-20);
        persist({ total: s.total, used, history });
        return { used, history, pulseId: s.pulseId + 1 };
      });
      notifyConsume(stage, cost, quotaRemainingSnap);
      // Auto-trigger low-credit prompt — 基于任务额度比例
      if (quotaRemainingSnap === 0) {
        set({ lowOpen: true, lowDismissedFor: null });
      } else if (quotaRemainingSnap / QUOTA <= 0.1) {
        if (!taskId || get().lowDismissedFor !== taskId) set({ lowOpen: true });
      }
      // Backend ledger insert (best-effort)。注意：后端 total 含充值，仅作为账户余额来源，
      // 不会再覆盖本地任务额度逻辑。
      void (async () => {
        try {
          const { consumeCredits } = await import("@/lib/credits.functions");
          const r = await consumeCredits({
            data: { taskId: taskId ?? null, stage, label, cost },
          });
          set({ used: r.used, total: r.total, synced: true });
          persist({ total: r.total, used: r.used, history: get().history });
          const qRemain = Math.max(0, QUOTA - Math.min(QUOTA, r.used));
          if (qRemain === 0) set({ lowOpen: true, lowDismissedFor: null });
          else if (qRemain / QUOTA <= 0.1) {
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
        let used = r.used, total = r.total, remaining = r.remaining;
        try {
          const b = await getCreditsBalance();
          used = b.used; total = b.total; remaining = b.remaining;
        } catch { /* ignore */ }
        set({ used, total, synced: true, toppingUp: false, pulseId: get().pulseId + 1 });
        persist({ total, used, history: get().history });
        toast.success(`充值成功 · 到账 ${n} 积分`, {
          description: `账户余额 ${Math.max(0, remaining)} · 任务额度 ${Math.max(0, QUOTA - Math.min(QUOTA, used))} / ${QUOTA}`,
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
  /** 账户余额（含充值），用于 hover 面板的"账户余额"行。 */
  remaining: (s: CreditsState) => Math.max(0, s.total - s.used),
  /** 任务额度内已用积分（封顶 200）。 */
  quotaUsed: (s: CreditsState) => Math.min(QUOTA, s.used),
  /** 任务额度剩余（0 - 200）。驱动圆环 / 进度条 / 圆点。 */
  quotaRemaining: (s: CreditsState) => Math.max(0, QUOTA - Math.min(QUOTA, s.used)),
  /** 任务额度剩余百分比 0..1。 */
  quotaPercent: (s: CreditsState) =>
    Math.max(0, Math.min(1, (QUOTA - Math.min(QUOTA, s.used)) / QUOTA)),
  /** 已消耗百分比（0..100）— 旧接口保留兼容。 */
  percent: (s: CreditsState) => Math.min(100, Math.round((Math.min(QUOTA, s.used) / QUOTA) * 100)),
  remainingPercent: (s: CreditsState) =>
    Math.round(Math.max(0, Math.min(1, (QUOTA - Math.min(QUOTA, s.used)) / QUOTA)) * 100),
};
