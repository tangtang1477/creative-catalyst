import { cn } from "@/lib/utils";

interface Props {
  color?: "accent" | "danger";
  className?: string;
}

export function PulseDot({ color = "accent", className }: Props) {
  const c = color === "accent" ? "var(--accent)" : "var(--status-failed)";
  return (
    <span
      className={cn("relative inline-flex h-2 w-2 items-center justify-center", className)}
      aria-hidden
    >
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{
          background: c,
          animation: "pulse-ring 1.6s cubic-bezier(0,0,.2,1) infinite",
        }}
      />
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: c, boxShadow: `0 0 8px ${c}` }}
      />
    </span>
  );
}
