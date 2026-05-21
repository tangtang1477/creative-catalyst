import { Loader2, Check, AlertCircle, RotateCw, Clock } from "lucide-react";
import type { AssetStatus } from "@/lib/sc/types";
import { cn } from "@/lib/utils";

const map: Record<
  AssetStatus,
  { color: string; bg: string; Icon: typeof Loader2; spin?: boolean }
> = {
  Generating: {
    color: "text-status-generating",
    bg: "bg-status-generating/12",
    Icon: Loader2,
    spin: true,
  },
  Queued: { color: "text-status-queued", bg: "bg-status-queued/15", Icon: Clock },
  Processing: {
    color: "text-status-processing",
    bg: "bg-status-processing/15",
    Icon: Loader2,
    spin: true,
  },
  "Status checked": {
    color: "text-status-generating",
    bg: "bg-status-generating/12",
    Icon: Check,
  },
  Ready: { color: "text-status-ready", bg: "bg-status-ready/15", Icon: Check },
  Recovering: {
    color: "text-status-recovering",
    bg: "bg-status-recovering/15",
    Icon: RotateCw,
    spin: true,
  },
  Failed: {
    color: "text-status-failed",
    bg: "bg-status-failed/15",
    Icon: AlertCircle,
  },
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  const { color, bg, Icon, spin } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        color,
        bg,
      )}
    >
      <Icon className={cn("h-3 w-3", spin && "animate-spin")} />
      {status}
    </span>
  );
}
