import { useState } from "react";
import { ChevronDown, Brain, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Thought } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";

/**
 * Flat foldable thought block. No card border — single icon + title row when
 * collapsed; expanded reveals body + reference thumbnails directly inline.
 */
export function ThinkingBlock({ thought }: { thought: Thought }) {
  const [open, setOpen] = useState(false);
  const assets = useSC((s) => s.assets);
  const focusAsset = useSC((s) => s.focusAsset);
  const thumbs = (thought.thumbAssetIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const preview = thought.summary ?? thought.body[0] ?? "";

  return (
    <div className="[animation:stream-fade_280ms_ease-out_both]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left text-[12px] text-foreground/85 hover:text-foreground"
      >
        <Brain className="h-3 w-3 shrink-0 text-accent" />
        <span className="shrink-0 text-muted-foreground">Thought</span>
        <span className="truncate text-foreground/85">{thought.title}</span>
        {!open && preview && (
          <span className="hidden truncate text-[11.5px] text-muted-foreground sm:inline">
            · {preview}
          </span>
        )}
        {thumbs.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            {thumbs.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform",
            thumbs.length > 0 ? "ml-1" : "ml-auto",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-1.5 pl-[18px] pt-1 text-[12px] leading-relaxed text-foreground/85 [animation:stream-fade_320ms_ease-out_both]">

          <div className="space-y-0.5">
            {thought.body.map((line, i) => (
              <p key={i} className="text-muted-foreground">
                <span className="mr-1 text-accent/60">·</span>
                {line}
              </p>
            ))}
          </div>
          {thumbs.length > 0 && (
            <div className="mt-1.5">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                参考素材 · {thumbs.length}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {thumbs.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => focusAsset(a.id)}
                    title={a.caption ?? a.label}
                    className="group/thumb overflow-hidden rounded-md border border-border bg-surface-2 transition-transform hover:scale-105 hover:border-accent/60"
                  >
                    {a.url ? (
                      <img
                        src={a.url}
                        alt={a.label}
                        className="block h-16 w-16 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center text-[10px] text-muted-foreground">
                        {a.label}
                      </div>
                    )}
                    <div className="px-1 py-0.5 text-center font-mono text-[9px] text-accent">
                      {a.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
