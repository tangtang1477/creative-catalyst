import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/** Smooth max-height + opacity collapse. Measures content height on demand. */
export function Collapse({ open, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">(open ? "auto" : 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      const measured = el.scrollHeight;
      setH(measured);
      const t = window.setTimeout(() => setH("auto"), 320);
      return () => window.clearTimeout(t);
    } else {
      // freeze current height then animate to 0
      const measured = el.scrollHeight;
      setH(measured);
      requestAnimationFrame(() => setH(0));
    }
  }, [open, children]);

  return (
    <div
      style={{ maxHeight: h === "auto" ? "none" : `${h}px` }}
      className={cn(
        "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
        open ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}
