import { useState } from "react";
import { ChevronDown, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Thought } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";

export function ThinkingBlock({ thought }: { thought: Thought }) {
  const [open, setOpen] = useState(false);
  const assets = useSC((s) => s.assets);
  const thumbs = (thought.thumbAssetIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div className="rounded-xl border border-border bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
      >
        <Brain className="h-3 w-3 text-accent/80" />
        <span className="truncate">Thought · {thought.title}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-2.5 pt-1 text-[12px] leading-relaxed text-foreground/80 [animation:stream-fade_320ms_ease-out_both]">
          {thought.body.map((line, i) => (
            <p key={i}>· {line}</p>
          ))}
          {thumbs.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1.5">
              {thumbs.map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-md border border-border bg-surface-2"
                  title={a.caption ?? a.label}
                >
                  {a.url ? (
                    <img
                      src={a.url}
                      alt={a.label}
                      className="h-14 w-14 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center text-[10px] text-muted-foreground">
                      {a.label}
                    </div>
                  )}
                  <div className="px-1 py-0.5 text-center font-mono text-[9px] text-accent">
                    {a.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
