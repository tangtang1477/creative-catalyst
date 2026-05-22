import { useEffect, useMemo, useState } from "react";
import { Film, Image as ImageIcon } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  caret: number;
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
  onPick: (insertText: string, replaceFrom: number, replaceTo: number) => void;
}

/** Reads the current `@xxx` query immediately before the caret. */
function getQuery(text: string, caret: number): { q: string; from: number } | null {
  const slice = text.slice(0, caret);
  const at = slice.lastIndexOf("@");
  if (at < 0) return null;
  // must be at start or preceded by whitespace
  if (at > 0 && !/\s/.test(slice[at - 1])) return null;
  const q = slice.slice(at + 1);
  if (/\s/.test(q)) return null;
  return { q, from: at };
}

export function MentionPopover({ value, caret, anchorRef, onPick }: Props) {
  const { assets, attachments } = useSC();
  const [active, setActive] = useState(0);

  const query = getQuery(value, caret);
  const items = useMemo(() => {
    if (!query) return [];
    const q = query.q.toLowerCase();
    const fromAssets = assets
      .filter((a) => a.status === "Ready" && a.url)
      .map((a) => ({
        key: a.id,
        label: `@${a.id}`,
        sub: a.caption ?? a.label,
        thumb: a.kind === "image" ? a.url : a.poster,
        kind: a.kind,
      }));
    const fromAttach = attachments.map((a) => ({
      key: a.id,
      label: a.ref ? `@${a.ref}` : a.name,
      sub: a.source,
      thumb: a.thumb,
      kind: a.kind,
    }));
    return [...fromAssets, ...fromAttach].filter(
      (x) => !q || x.label.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q),
    );
  }, [query, assets, attachments]);

  useEffect(() => setActive(0), [query?.q]);

  useEffect(() => {
    if (!query || items.length === 0) return;
    const ta = anchorRef.current;
    if (!ta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[active];
        if (it) onPick(`${it.label} `, query.from, caret);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onPick("", -1, -1);
      }
    };
    ta.addEventListener("keydown", onKey);
    return () => ta.removeEventListener("keydown", onKey);
  }, [query, items, active, caret, anchorRef, onPick]);

  if (!query || items.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-2 z-30 mb-2 w-[260px] overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-xl",
        "[animation:stream-fade_180ms_ease-out_both]",
      )}
    >
      <div className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
        Reference
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(`${it.label} `, query.from, caret)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left text-[12px] transition-colors",
              active === i ? "bg-surface-2 text-accent" : "text-foreground/85 hover:bg-surface-2",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-foreground/70">
              {it.thumb ? (
                <img src={it.thumb} alt="" className="h-full w-full object-cover" />
              ) : it.kind === "video" ? (
                <Film className="h-3.5 w-3.5" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{it.label}</span>
              <span className="truncate text-[11px] text-muted-foreground">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
