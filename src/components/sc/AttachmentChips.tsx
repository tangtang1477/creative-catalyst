import { X, Film, Image as ImageIcon, Link2, AtSign, Music } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

export function AttachmentChips() {
  const { attachments, removeAttachment } = useSC();
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      {attachments.map((a) => (
        <span
          key={a.id}
          className={cn(
            "group flex items-center gap-1.5 rounded-xl bg-surface-2 py-1 pl-1 pr-1.5 text-[11.5px] text-foreground/85 ring-1 ring-border transition-colors",
            "hover:ring-accent/60 hover:text-accent",
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-foreground/70">
            {a.thumb ? (
              <img src={a.thumb} alt="" className="h-full w-full object-cover" />
            ) : a.kind === "video" ? (
              <Film className="h-3 w-3" />
            ) : a.source === "url" ? (
              <Link2 className="h-3 w-3" />
            ) : a.source === "asset" ? (
              <AtSign className="h-3 w-3" />
            ) : (
              <ImageIcon className="h-3 w-3" />
            )}
          </span>
          <span className="max-w-[120px] truncate">
            {a.ref ? `@${a.ref}` : a.name}
          </span>
          <button
            type="button"
            aria-label="remove"
            onClick={() => removeAttachment(a.id)}
            className="flex h-4 w-4 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
