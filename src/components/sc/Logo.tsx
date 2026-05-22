import logoSrc from "@/assets/logo-m.png";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  loading?: boolean;
  glow?: boolean;
  className?: string;
}

export function Logo({ size = 24, loading = false, glow = false, className }: Props) {
  return (
    <img
      src={logoSrc}
      alt="Vibe Aideo"
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size }}
      className={cn(
        "select-none object-contain",
        loading && "[animation:logo-shimmer_1.8s_ease-in-out_infinite]",
        !loading && glow && "[animation:logo-glow_2.6s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}
