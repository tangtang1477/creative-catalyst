import { useState } from "react";
import { Check, Sparkles, Zap, Crown, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCredits } from "@/lib/sc/credits-store";

interface Tier {
  id: "starter" | "plus" | "pro";
  name: string;
  Icon: typeof Sparkles;
  tagline: string;
  monthly: number;
  yearly: number;
  credits: number;
  perks: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    Icon: Sparkles,
    tagline: "适合个人尝鲜",
    monthly: 12,
    yearly: 9,
    credits: 200,
    perks: ["200 credits / 月", "720p · 标清渲染", "Email 支持"],
  },
  {
    id: "plus",
    name: "Plus",
    Icon: Zap,
    tagline: "创作者首选 · 51% OFF",
    monthly: 39,
    yearly: 19,
    credits: 800,
    perks: [
      "800 credits / 月",
      "1080p · 高清渲染",
      "MovieFlow 优先队列",
      "批量素材修改",
    ],
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    Icon: Crown,
    tagline: "团队 / 商用",
    monthly: 99,
    yearly: 79,
    credits: 3000,
    perks: ["3000 credits / 月", "4K 渲染", "并发渲染 × 4", "商用授权"],
  },
];

export function PricingDialog() {
  const open = useCredits((s) => s.pricingOpen);
  const openPricing = useCredits((s) => s.openPricing);
  const closePricing = useCredits((s) => s.closePricing);
  const setOpen = (v: boolean) => (v ? openPricing() : closePricing());
  const topUp = useCredits((s) => s.topUp);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [selected, setSelected] = useState<Tier["id"]>("plus");

  const tier = TIERS.find((t) => t.id === selected)!;

  const handleContinue = () => {
    topUp(tier.credits);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[920px] gap-0 overflow-hidden border-border bg-surface p-0 [&>button]:hidden">
        <div className="relative px-8 pt-8">
          <button
            onClick={() => setOpen(false)}
            aria-label="close"
            className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[11px] font-medium text-accent">
              <Sparkles className="h-3 w-3" />
              限时 51% OFF · 仅此一周
            </div>
            <h2 className="text-[24px] font-semibold tracking-tight">
              升级你的创作上限
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              选择适合你的方案，立即解锁更多 credits 与高级渲染。
            </p>
          </div>

          {/* cycle toggle */}
          <div className="mx-auto mt-5 flex w-fit items-center gap-1 rounded-full bg-surface-2 p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-medium transition-all",
                  cycle === c
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c === "monthly" ? "月付" : "年付 · 省 51%"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 px-8 py-6">
          {TIERS.map((t) => {
            const isSel = selected === t.id;
            const price = cycle === "monthly" ? t.monthly : t.yearly;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  "group relative flex flex-col rounded-2xl border bg-surface p-5 text-left transition-all duration-200",
                  "hover:-translate-y-1 hover:shadow-[0_12px_30px_-12px_rgba(113,240,246,0.35)]",
                  isSel
                    ? "border-accent shadow-[0_0_0_1px_var(--accent),0_12px_30px_-12px_rgba(113,240,246,0.5)]"
                    : "border-border",
                  t.highlight && !isSel && "border-accent/40",
                )}
              >
                {t.highlight && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                    POPULAR
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <t.Icon className={cn("h-4 w-4", isSel ? "text-accent" : "text-muted-foreground")} />
                  <span className="text-[14px] font-semibold">{t.name}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{t.tagline}</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[28px] font-bold tracking-tight">${price}</span>
                  <span className="text-[11px] text-muted-foreground">/ 月</span>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-[12px] text-foreground/85">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                      {p}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-8 py-4">
          <div className="text-[11.5px] text-muted-foreground">
            7 天无理由退款 · 随时取消
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              稍后再说
            </button>
            <button
              onClick={handleContinue}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-[12.5px] font-semibold text-accent-foreground transition-all hover:brightness-110 hover:shadow-[0_0_18px_rgba(113,240,246,0.55)]"
            >
              <Zap className="h-3.5 w-3.5" />
              升级到 {tier.name} · 充值 {tier.credits} credits
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
