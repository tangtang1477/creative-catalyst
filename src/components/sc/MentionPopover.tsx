import { useEffect, useMemo, useState } from "react";
import { Film, Image as ImageIcon, AtSign } from "lucide-react";
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
  // must be at start or preceded by non-word (whitespace, punctuation, CJK 标点)
  if (at > 0 && /\w/.test(slice[at - 1])) return null;
  const q = slice.slice(at + 1);
  // bail if the @-token contains whitespace (user moved on)
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
        // Token inserted into textarea (short, machine-friendly).
        insert: `@${a.id}`,
        label: `@${a.id}`,
        sub: a.caption ?? a.label,
        thumb: a.kind === "image" ? a.url : a.poster,
        kind: a.kind as "image" | "video",
      }));
    const fromAttach = attachments.map((a) => {
      const friendly = a.displayName ?? a.name;
      return {
        key: a.id,
        insert: friendly.replace(/\s+/g, ""), // 图片1 — no space, avoids `@` parsing snags
        label: friendly,
        sub: a.name,
        thumb: a.thumb ?? (a.kind === "image" ? a.url : undefined),
        kind: a.kind as "image" | "video",
      };
    });
    return [...fromAssets, ...fromAttach].filter(
      (x) => !q || x.label.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q),
    );
  }, [query, assets, attachments]);


  useEffect(() => setActive(0), [query?.q]);

  useEffect(() => {
    if (!query) return;
    const ta = anchorRef.current;
    if (!ta) return;
    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) {
        // still capture Escape to dismiss visually (popover hides when query gone)
        return;
      }
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
      }
    };
    ta.addEventListener("keydown", onKey);
    return () => ta.removeEventListener("keydown", onKey);
  }, [query, items, active, caret, anchorRef, onPick]);

  if (!query) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-2 z-30 mb-2 w-[300px] overflow-hidden rounded-2xl border border-border bg-surface/95 p-1 shadow-xl backdrop-blur",
        "[animation:stream-fade_180ms_ease-out_both]",
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
        <AtSign className="h-3 w-3 text-accent" />
        Reference assets
        {items.length > 0 && (
          <span className="ml-auto font-mono normal-case tracking-normal">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-2.5 py-3 text-[11.5px] text-muted-foreground">
          <p>暂无可引用的素材。</p>
          <p className="mt-1 text-[10.5px] opacity-70">
            生成或上传后，可用 <span className="font-mono text-accent">@A01</span>、
            <span className="font-mono text-accent">@W01</span> 等编号引用。
          </p>
        </div>
      ) : (
        <div className="max-h-[240px] overflow-y-auto">
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-foreground/70">
                {it.thumb ? (
                  <img src={it.thumb} alt="" className="h-full w-full object-cover" />
                ) : it.kind === "video" ? (
                  <Film className="h-3.5 w-3.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-[12px]">{it.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
