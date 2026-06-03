import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  aspect?: string;
  maxHeight?: number;
  className?: string;
}

/**
 * Blue aurora loader used while images / videos are generating.
 * Only animated blue gradient blobs + a horizontal shimmer sweep —
 * intentionally no spinner rings (feels like the whole frame is rendering).
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
        "relative w-full overflow-hidden rounded-xl bg-[#05080f]",
        className,
      )}
      style={{ aspectRatio: aspect, maxHeight }}
    >
      <div
        className="absolute -inset-[20%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--loader-blue-1) 75%, transparent), transparent 70%)",
          filter: "blur(38px)",
          animation: "aurora-a 4s cubic-bezier(.4,0,.2,1) infinite",
        }}
      />
      <div
        className="absolute -inset-[20%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--loader-blue-2) 70%, transparent), transparent 70%)",
          filter: "blur(46px)",
          animation: "aurora-b 5s cubic-bezier(.4,0,.2,1) infinite",
        }}
      />
      <div
        className="absolute -inset-[20%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--loader-blue-3) 60%, transparent), transparent 70%)",
          filter: "blur(56px)",
          animation: "aurora-c 6.5s cubic-bezier(.4,0,.2,1) infinite",
        }}
      />

      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--loader-blue-3) 55%, transparent), transparent)",
          filter: "blur(12px)",
          animation: "loader-shimmer 2.6s ease-in-out infinite",
        }}
      />

      <div className="absolute bottom-2.5 left-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: "var(--loader-blue-3)", boxShadow: "0 0 6px var(--loader-blue-2)" }}
          />
          {label}
        </span>
      </div>
    </div>
  );
}
