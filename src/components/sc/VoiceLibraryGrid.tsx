import { useEffect } from "react";
import { Play, Pause, Loader2, Mic } from "lucide-react";
import { useVoices } from "@/lib/sc/voices-store";
import { voiceAvatarFor } from "./voice-avatars";
import { cn } from "@/lib/utils";

/**
 * 音色库网格：1:1 头像 + 名称 + 试听按钮。
 * 数据来自 voices-store；预设音色用预生成头像，克隆音色用首字母渐变。
 */
export function VoiceLibraryGrid() {
  const voices = useVoices((s) => s.voices);
  const loaded = useVoices((s) => s.loaded);
  const loading = useVoices((s) => s.loading);
  const fetchVoices = useVoices((s) => s.fetchVoices);
  const preview = useVoices((s) => s.preview);
  const stopPreview = useVoices((s) => s.stopPreview);
  const previewingId = useVoices((s) => s.previewingId);

  useEffect(() => {
    if (!loaded) fetchVoices();
  }, [loaded, fetchVoices]);

  const ready = voices.filter((v) => v.status === "ready");

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载音色中…
      </div>
    );
  }

  if (ready.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-2/20 px-3 py-6 text-center text-[11.5px] text-muted-foreground">
        暂无可用音色
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {ready.map((v) => {
        const avatar = v.source === "preset" ? voiceAvatarFor(v.name) : undefined;
        const playing = previewingId === v.id;
        const initial = v.name.charAt(0).toUpperCase();
        return (
          <div
            key={v.id}
            className={cn(
              "group overflow-hidden rounded-xl border border-border bg-surface-2/40 transition-colors",
              playing && "border-accent/60 bg-accent/10",
            )}
          >
            <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
              {avatar ? (
                <img
                  src={avatar}
                  alt={v.name}
                  loading="lazy"
                  width={512}
                  height={512}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/40 to-accent/10 text-[44px] font-semibold text-foreground/90">
                  {initial}
                </div>
              )}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9.5px] font-medium text-white backdrop-blur">
                {v.source === "preset" ? "预设" : "我的"}
              </span>
              <button
                type="button"
                aria-label={playing ? "停止试听" : "试听"}
                onClick={() => (playing ? stopPreview() : preview(v.id))}
                className={cn(
                  "absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full shadow-md backdrop-blur transition-colors",
                  playing
                    ? "bg-accent text-accent-foreground"
                    : "bg-background/85 text-foreground hover:bg-background",
                )}
              >
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center gap-1 px-2 py-1.5">
              <Mic className="h-3 w-3 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground">{v.name}</div>
                {v.description && (
                  <div className="truncate text-[10px] text-muted-foreground">{v.description}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
