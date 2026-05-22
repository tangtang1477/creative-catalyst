import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  children: ReactNode;
  className?: string;
  duration?: number;
}

/**
 * Smooth max-height + opacity collapse using measured content height.
 */
export function Collapse({ open, children, className, duration = 280 }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number>(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      className={cn("overflow-hidden", className)}
      style={{
        maxHeight: open ? h : 0,
        opacity: open ? 1 : 0,
        transition: `max-height ${duration}ms cubic-bezier(0.22,1,0.36,1), opacity ${duration}ms ease-out`,
      }}
      aria-hidden={!open}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
