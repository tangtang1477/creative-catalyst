import { X, Film, Image as ImageIcon, Link2, Music } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

/**
 * Square 44×44 thumbnail chips shown above the textarea.
 * Hover reveals the friendly displayName ("图片 1") + original filename.
 */
export function AttachmentChips() {
  const { attachments, removeAttachment } = useSC();
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      {attachments.map((a) => {
        const label = a.displayName ?? a.name;
        return (
          <div
            key={a.id}
            className={cn(
              "group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors",
              "hover:border-accent/60",
            )}
            title={`${label} · ${a.name}`}
          >
            {a.thumb || (a.kind === "image" && a.url) ? (
              <img
                src={a.thumb ?? a.url}
                alt={label}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-foreground/70">
                {a.kind === "video" ? (
                  <Film className="h-4 w-4" />
                ) : a.kind === "audio" ? (
                  <Music className="h-4 w-4" />
                ) : a.source === "url" ? (
                  <Link2 className="h-4 w-4" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                <span className="text-[9px] leading-none text-muted-foreground">
                  {label}
                </span>
              </div>
            )}

            {/* tiny label overlay for media that has a thumbnail */}
            {(a.thumb || (a.kind === "image" && a.url)) && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-[1px] text-center text-[9px] font-medium leading-tight text-white">
                {label}
              </span>
            )}

            <button
              type="button"
              aria-label={`remove ${label}`}
              onClick={() => removeAttachment(a.id)}
              className={cn(
                "absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity",
                "group-hover:opacity-100 focus:opacity-100",
                "hover:bg-rose-500",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
