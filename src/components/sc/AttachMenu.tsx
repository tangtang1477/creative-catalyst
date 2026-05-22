import { useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Link2, Image as ImageIcon, Film } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import type { Attachment } from "@/lib/sc/types";
import { cn } from "@/lib/utils";

const aid = () => `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function Row({ icon, label, onClick, children }: { icon: ReactNode; label: string; onClick?: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-foreground/85 transition-colors hover:bg-surface-2 hover:text-accent"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground/70">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {children}
    </button>
  );
}

export function AttachMenu({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { addAttachment, assets } = useSC();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const kind: Attachment["kind"] = file.type.startsWith("video") ? "video" : "image";
      const url = URL.createObjectURL(file);
      addAttachment({
        id: aid(),
        kind,
        name: file.name,
        url,
        thumb: kind === "image" ? url : undefined,
        source: "upload",
      });
    });
    setOpen(false);
  };

  const onUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    const isVideo = /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(v);
    addAttachment({
      id: aid(),
      kind: isVideo ? "video" : "image",
      name: v.split("/").pop() || v,
      url: v,
      thumb: !isVideo ? v : undefined,
      source: "url",
    });
    setUrlInput("");
    setOpen(false);
  };

  const readyAssets = assets.filter((a) => a.status === "Ready" && a.url);

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild disabled={disabled}>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] rounded-2xl border-border bg-surface p-1.5 shadow-xl"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Row icon={<Upload className="h-3.5 w-3.5" />} label="Upload from device" onClick={() => fileRef.current?.click()} />

        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground/70">
            <Link2 className="h-3.5 w-3.5" />
          </span>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onUrl())}
            placeholder="Paste image or video URL"
            className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {readyAssets.length > 0 && (
          <>
            <div className="mt-1 border-t border-border/60 pt-1.5">
              <div className="px-2.5 pb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">From gallery</div>
              <div className="max-h-[200px] overflow-y-auto px-1 pb-1">
                {readyAssets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      addAttachment({
                        id: aid(),
                        kind: a.kind,
                        name: a.label,
                        url: a.url!,
                        thumb: a.kind === "image" ? a.url : a.poster,
                        source: "asset",
                        ref: a.id,
                      });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    <span className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-foreground/70",
                    )}>
                      {a.kind === "image" && a.url ? (
                        <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                      ) : a.poster ? (
                        <img src={a.poster} alt={a.label} className="h-full w-full object-cover" />
                      ) : a.kind === "video" ? (
                        <Film className="h-3.5 w-3.5" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-foreground/90">@{a.id}</span>
                      <span className="text-[11px] text-muted-foreground">{a.caption ?? a.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
