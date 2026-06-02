import { useEffect, useMemo, useState } from "react";
import { Users, Play, Pause, X, Loader2 } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { useVoices } from "@/lib/sc/voices-store";
import {
  bindCharacterVoice,
  listCharacterVoices,
  unbindCharacterVoice,
} from "@/lib/characters.functions";
import { cn } from "@/lib/utils";

interface Binding {
  id: string;
  character_name: string;
  voice_id: string;
}

/**
 * 角色 ↔ 音色绑定面板。
 * 从当前 script.wardrobe 中提取以 W 开头的角色，每行可绑定一个音色。
 */
export function CharacterVoiceBinding() {
  const script = useSC((s) => s.script);
  const voices = useVoices((s) => s.voices);
  const preview = useVoices((s) => s.preview);
  const stopPreview = useVoices((s) => s.stopPreview);
  const previewingId = useVoices((s) => s.previewingId);

  const characters = useMemo(() => {
    if (!script?.wardrobe) return [];
    return script.wardrobe
      .filter((w) => w.id.toUpperCase().startsWith("W"))
      .map((w) => ({ id: w.id, name: w.caption }));
  }, [script]);

  const [bindings, setBindings] = useState<Binding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listCharacterVoices({ data: {} })
      .then((r) => setBindings(r.bindings as Binding[]))
      .catch(() => void 0);
  }, []);

  if (!characters.length) return null;

  const bindingFor = (name: string) =>
    bindings.find((b) => b.character_name === name);

  async function handleBind(name: string, voice_id: string) {
    setBusy(name);
    try {
      const existing = bindingFor(name);
      if (existing) await unbindCharacterVoice({ data: { id: existing.id } });
      const { binding } = await bindCharacterVoice({
        data: { character_name: name, voice_id },
      });
      setBindings((prev) => [
        ...prev.filter((b) => b.character_name !== name),
        binding as Binding,
      ]);
    } finally {
      setBusy(null);
    }
  }

  async function handleUnbind(id: string) {
    setBusy(id);
    try {
      await unbindCharacterVoice({ data: { id } });
      setBindings((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/30 p-3">
      <h4 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-foreground">
        <Users className="h-3 w-3 text-accent" /> 角色音色绑定
      </h4>
      <div className="space-y-1.5">
        {characters.map((c) => {
          const b = bindingFor(c.name);
          const voice = b ? voices.find((v) => v.id === b.voice_id) : null;
          const playing = voice && previewingId === voice.id;
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
            >
              <span className="rounded-md bg-background/60 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-accent">
                {c.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                {c.name}
              </span>
              {b && voice ? (
                <>
                  <span className="truncate rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                    {voice.name}
                  </span>
                  <button
                    type="button"
                    aria-label="preview"
                    disabled={!voice}
                    onClick={() =>
                      playing ? stopPreview() : preview(voice.id)
                    }
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                      playing
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    {playing ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="unbind"
                    disabled={busy === b.id}
                    onClick={() => handleUnbind(b.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    {busy === b.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </>
              ) : (
                <select
                  disabled={busy === c.name || !voices.length}
                  defaultValue=""
                  onChange={(e) => e.target.value && handleBind(c.name, e.target.value)}
                  className="h-7 rounded-md border border-border bg-background/40 px-2 text-[11.5px] text-foreground outline-none focus:border-accent/60"
                >
                  <option value="" disabled>
                    {busy === c.name ? "绑定中…" : "选择音色"}
                  </option>
                  {voices
                    .filter((v) => v.status === "ready")
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.source === "preset" ? "预设 · " : "我的 · "}
                        {v.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
