import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  aspect?: "9 / 16" | "16 / 9" | "1 / 1";
  maxHeight?: number;
  className?: string;
}

/**
 * Gradient aurora loader used while images / videos are generating.
 * Soft blurred radial gradient bg + slow drifting blobs + center thin ring.
 * Colors pulled from theme tokens (accent / primary) via oklch mixes.
 */
export function GradientLoader({
  label = "Generating",
  aspect = "9 / 16",
  maxHeight,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl bg-[#0a0a0c]",
        className,
      )}
      style={{ aspectRatio: aspect, maxHeight }}
    >
      {/* Aurora blobs */}
      <div
        className="absolute -inset-[20%] opacity-80"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 55%, transparent), transparent 70%)",
          filter: "blur(40px)",
          animation: "aurora-a 7s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -inset-[20%] opacity-70 mix-blend-screen"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--status-recovering) 55%, transparent), transparent 70%)",
          filter: "blur(50px)",
          animation: "aurora-b 9s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -inset-[20%] opacity-60 mix-blend-screen"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--status-processing) 45%, transparent), transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-c 11s ease-in-out infinite",
        }}
      />

      {/* Center thin ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-[1.5px] border-white/55 border-t-transparent animate-spin" />
      </div>

      {/* Bottom pill label */}
      <div className="absolute bottom-2.5 left-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-white/85" />
          {label}
        </span>
      </div>
    </div>
  );
}
