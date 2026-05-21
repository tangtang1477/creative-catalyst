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
 * Uses Tailwind utilities mapped to design tokens.
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
      "relative inline-flex select-none items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium leading-none outline-none transition-[background-color,border-color,color,transform,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

    const sizes: Record<Size, string> = {
      sm: "h-7 px-2.5",
      md: "h-8 px-3",
      icon: "h-8 w-8 p-0",
    };

    const variants: Record<Variant, string> = {
      primary: cn(
        "border-transparent bg-accent text-accent-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_40%,transparent)]",
        "hover:bg-[color-mix(in_oklab,var(--accent)_88%,white)]",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--accent)_75%,black)]",
      ),
      ghost: cn(
        "border-transparent bg-transparent text-foreground/85",
        "hover:bg-surface-2 hover:text-foreground",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      outline: cn(
        "border-border bg-surface text-foreground/90",
        "hover:bg-surface-2 hover:border-border-strong",
        "active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      icon: cn(
        "border-transparent bg-transparent text-foreground/70",
        "hover:bg-surface-2 hover:text-foreground",
        "active:scale-[0.95] active:bg-[color-mix(in_oklab,var(--surface-2)_70%,black)]",
      ),
      destructive: cn(
        "border-transparent bg-status-failed/15 text-status-failed",
        "hover:bg-status-failed/25",
        "active:scale-[0.98] active:bg-status-failed/35",
      ),
      chip: cn(
        selected
          ? "border-accent/60 bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface))] text-foreground"
          : "border-border bg-surface text-foreground/85",
        !selected && "hover:bg-surface-2 hover:border-border-strong",
        selected && "hover:bg-[color-mix(in_oklab,var(--accent)_24%,var(--surface))]",
        "active:scale-[0.98]",
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
