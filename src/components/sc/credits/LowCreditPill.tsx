import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  message: string;
  onTopUp: () => void;
  onClose?: () => void;
  variant?: "toast" | "inline";
  className?: string;
}

/**
 * Pill-shaped low-credit notice. Used both as a fixed toast (bottom-right)
 * and inline inside a stage row when the life stage cannot start.
 */
export function LowCreditPill({
  title = "Credits are running low",
  message,
  onTopUp,
  onClose,
  variant = "inline",
  className,
}: Props) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-full border border-border bg-background/95 py-2 pl-3 pr-2 shadow-2xl backdrop-blur",
        "[animation:stream-fade_360ms_ease-out_both]",
        variant === "toast"
          ? "fixed bottom-5 right-5 z-50 w-[440px] max-w-[calc(100vw-2rem)]"
          : "w-full",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--credit-low)_25%,transparent)]">
        <span
          className="h-3 w-3 rotate-45 rounded-[2px]"
          style={{ background: "var(--credit-low)" }}
        />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <span className="font-medium text-foreground">{title}</span>
        <span className="ml-1.5 text-muted-foreground">{message}</span>
      </div>
      <button
        onClick={onTopUp}
        className="rounded-full bg-background px-4 py-1.5 text-[12px] font-semibold text-foreground shadow ring-1 ring-border transition-all hover:text-accent hover:ring-accent/60"
      >
        Top Up
      </button>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="dismiss"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
