import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "icon" | "destructive" | "chip";
type Size = "sm" | "md" | "icon";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  selected?: boolean;
}

/**
 * SC button with full three-state: default / hover / active(pressed) / focus / disabled.
 */
export const SCButton = React.forwardRef<HTMLButtonElement, Props>(
  (
    {
      className,
      variant = "ghost",
      size = "md",
      selected = false,
      disabled,
      children,
      ...rest
    },
    ref,
  ) => {
    const base =
      "relative inline-flex select-none items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-medium leading-none outline-none transition-[background-color,color,transform,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

    const sizes: Record<Size, string> = {
      sm: "h-7 px-3",
      md: "h-8 px-3.5",
      icon: "h-8 w-8 p-0",
    };

    const variants: Record<Variant, string> = {
      primary: cn(
        "bg-accent text-accent-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_40%,transparent),0_4px_18px_-6px_rgba(113,240,246,0.55)]",
        "hover:bg-[color-mix(in_oklab,var(--accent)_88%,white)]",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--accent)_72%,black)]",
      ),
      ghost: cn(
        "bg-transparent text-foreground/80",
        "hover:bg-surface-2 hover:text-foreground",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      outline: cn(
        "border border-border bg-surface text-foreground/90",
        "hover:bg-surface-2 hover:border-border-strong",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      icon: cn(
        "bg-transparent text-foreground/70",
        "hover:bg-surface-2 hover:text-foreground",
        "active:scale-[0.95] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      destructive: cn(
        "bg-status-failed/15 text-status-failed",
        "hover:bg-status-failed/25",
        "active:scale-[0.98] active:bg-status-failed/35",
      ),
      chip: cn(
        // default solid pill, no border
        !selected && "bg-surface-2 text-foreground/85",
        !selected && "hover:bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface-2))] hover:text-accent",
        // selected: solid accent
        selected && "bg-accent text-accent-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_50%,transparent),0_3px_14px_-6px_rgba(113,240,246,0.6)]",
        selected && "hover:bg-[color-mix(in_oklab,var(--accent)_92%,white)]",
        "active:scale-[0.97]",
      ),
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(base, sizes[size], variants[variant], className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
SCButton.displayName = "SCButton";
