import { create } from "zustand";

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
  pulseId: number; // bump on each consume for UI animation triggers
  /** Whether we have synced with the backend ledger for the current user. */
  synced: boolean;
  consume: (stage: string, label: string, cost: number, taskId?: string | null) => void;
  topUp: (n: number) => void;
  resetUsed: () => void;
  canAfford: (cost: number) => boolean;
  openPricing: () => void;
  closePricing: () => void;
  openLow: (taskId?: string) => void;
  closeLow: (taskId?: string) => void;
  /** Pull balance from backend ledger and replace local cache. */
  syncFromBackend: () => Promise<void>;
}

const KEY = "sc.credits.v1";

const load = (): { total: number; used: number; history: CreditEvent[] } => {
  if (typeof window === "undefined") return { total: 100, used: 42, history: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { total: 100, used: 42, history: [] };
    const j = JSON.parse(raw);
    return {
      total: j.total ?? 100,
      used: Math.min(j.used ?? 0, j.total ?? 100),
      history: Array.isArray(j.history) ? j.history.slice(-20) : [],
    };
  } catch {
    return { total: 100, used: 42, history: [] };
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

    consume: (stage, label, cost) => {
      if (cost <= 0) return;
      set((s) => {
        const used = Math.min(s.total, s.used + cost);
        const history = [
          ...s.history,
          { ts: Date.now(), stage, label, cost },
        ].slice(-20);
        persist({ total: s.total, used, history });
        return { used, history, pulseId: s.pulseId + 1 };
      });
    },
    topUp: (n) => {
      set((s) => {
        const total = s.total + n;
        persist({ total, used: s.used, history: s.history });
        return { total, lowOpen: false, lowDismissedFor: null };
      });
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
  };
});

export const creditsSelectors = {
  remaining: (s: CreditsState) => Math.max(0, s.total - s.used),
  percent: (s: CreditsState) => Math.min(100, Math.round((s.used / s.total) * 100)),
  remainingPercent: (s: CreditsState) =>
    Math.max(0, Math.min(100, Math.round(((s.total - s.used) / s.total) * 100))),
};
