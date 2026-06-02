import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Play,
  Pause,
  Upload,
  Loader2,
  Trash2,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useVoices } from "@/lib/sc/voices-store";
import { supabase } from "@/integrations/supabase/client";
import { CharacterVoiceBinding } from "./CharacterVoiceBinding";
import { cn } from "@/lib/utils";

/**
 * 音色库面板 —— 显示预设音色 + 用户克隆音色，支持试听与上传克隆。
 * 三态：empty（未登录）/ loading / ready / failed
 */
export function VoiceLibraryPanel() {
  const voices = useVoices((s) => s.voices);
  const loaded = useVoices((s) => s.loaded);
  const loading = useVoices((s) => s.loading);
  const error = useVoices((s) => s.error);
  const fetchVoices = useVoices((s) => s.fetchVoices);
  const preview = useVoices((s) => s.preview);
  const stopPreview = useVoices((s) => s.stopPreview);
  const previewingId = useVoices((s) => s.previewingId);
  const openClone = useVoices((s) => s.openClone);
  const remove = useVoices((s) => s.remove);

  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ok = !!data.user;
      setAuthed(ok);
      if (ok && !loaded) fetchVoices();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      const ok = !!s;
      setAuthed(ok);
      if (ok) fetchVoices();
    });
    return () => subscription.unsubscribe();
  }, [fetchVoices, loaded]);

  if (authed === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/30 px-4 py-8 text-center">
        <Mic className="h-5 w-5 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">登录后可使用音色库与克隆功能</p>
        <a
          href="/login"
          className="rounded-full bg-accent px-3 py-1.5 text-[11px] text-accent-foreground hover:opacity-90"
        >
          前往登录
        </a>
      </div>
    );
  }

  const presets = voices.filter((v) => v.source === "preset");
  const cloned = voices.filter((v) => v.source === "cloned");

  return (
    <div className="space-y-4">
      {/* Cloned section header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-foreground">
          <Sparkles className="h-3 w-3 text-accent" /> 我的音色 ({cloned.length})
        </h4>
        <button
          type="button"
          onClick={openClone}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-surface-2/40 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-accent/60 hover:bg-accent/10"
        >
          <Upload className="h-3 w-3" />
          上传音频克隆
        </button>
      </div>

      {loading && !loaded ? (
        <div className="flex items-center justify-center py-6 text-[12px] text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> 加载音色中…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : (
        <>
          {cloned.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-2/20 px-3 py-4 text-center text-[11.5px] text-muted-foreground">
              还没有克隆音色，点击上方上传 30s-3min 的音频开始克隆。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {cloned.map((v) => (
                <VoiceCard
                  key={v.id}
                  voice={v}
                  playing={previewingId === v.id}
                  onPlay={() => (previewingId === v.id ? stopPreview() : preview(v.id))}
                  onDelete={() => remove(v.id)}
                />
              ))}
            </div>
          )}

          {/* Presets */}
          <h4 className="mt-4 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-foreground">
            预设音色 ({presets.length})
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((v) => (
              <VoiceCard
                key={v.id}
                voice={v}
                compact
                playing={previewingId === v.id}
                onPlay={() => (previewingId === v.id ? stopPreview() : preview(v.id))}
              />
            ))}
          </div>
        </>
      )}

      <CharacterVoiceBinding />
      <CloneVoiceDialog />
    </div>
  );
}

function VoiceCard({
  voice,
  playing,
  onPlay,
  onDelete,
  compact,
}: {
  voice: ReturnType<typeof useVoices.getState>["voices"][number];
  playing: boolean;
  onPlay: () => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const initial = voice.name.charAt(0).toUpperCase();
  const isPending = voice.status === "cloning" || voice.status === "uploading";
  const isFailed = voice.status === "failed";
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-2.5 py-2 transition-all",
        playing && "border-accent/60 bg-accent/10",
        isFailed && "border-destructive/40",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
          voice.source === "preset"
            ? "bg-gradient-to-br from-sky-500/40 to-violet-500/40 text-foreground"
            : "bg-gradient-to-br from-accent/50 to-accent/20 text-foreground",
          isPending && "animate-pulse",
        )}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium text-foreground">{voice.name}</span>
          {voice.status === "ready" && voice.source === "cloned" && (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          )}
          {isFailed && <AlertCircle className="h-3 w-3 text-destructive" />}
        </div>
        {!compact && (
          <p className="truncate text-[10.5px] text-muted-foreground">
            {isPending
              ? "克隆中…"
              : isFailed
                ? voice.error ?? "失败"
                : voice.description ?? voice.lang ?? ""}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={isPending || isFailed}
        onClick={onPlay}
        aria-label="preview"
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          playing ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          (isPending || isFailed) && "cursor-not-allowed opacity-40",
        )}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label="delete"
          onClick={onDelete}
          className="invisible inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function CloneVoiceDialog() {
  const open = useVoices((s) => s.cloneOpen);
  const close = useVoices((s) => s.closeClone);
  const clone = useVoices((s) => s.clone);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDesc("");
      setFile(null);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (!name.trim() || !file) {
      setErr("请填写名称并选择音频文件");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Upload to media bucket under voices/{userId}/...
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("请先登录");
      const ext = file.name.split(".").pop() ?? "mp3";
      const path = `voices/${userData.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type || "audio/mpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      await clone({ name: name.trim(), description: desc.trim() || undefined, audio_url: pub.publicUrl });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-[480px] gap-0 border border-border bg-surface p-0 [&>button.absolute]:hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <DialogTitle className="text-[18px] font-semibold tracking-tight text-foreground">
            克隆音色
          </DialogTitle>
          <button
            type="button"
            aria-label="close"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-6 pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="音色名称，如「Anna」"
            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent/60"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="描述（可选）：温柔女声 · 中文"
            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent/60"
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-[12px] transition-colors",
              file
                ? "border-accent/60 bg-accent/5 text-foreground"
                : "border-border bg-surface-2/30 text-muted-foreground hover:border-accent/40",
            )}
          >
            <Upload className="h-5 w-5" />
            {file ? (
              <>
                <span className="font-medium">{file.name}</span>
                <span className="text-[10.5px] text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择
                </span>
              </>
            ) : (
              <>
                <span>点击或拖入音频文件</span>
                <span className="text-[10.5px]">支持 mp3 / wav / m4a，30s-3min，≤10MB</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 10 * 1024 * 1024) {
                  setErr("文件超过 10MB");
                  return;
                }
                setFile(f);
                setErr(null);
              }}
            />
          </button>

          {err && <p className="text-[11.5px] text-destructive">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-5">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full px-4 text-[12.5px] text-foreground hover:bg-surface-2"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name.trim() || !file}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-[12.5px] font-medium",
              busy || !name.trim() || !file
                ? "cursor-not-allowed bg-surface-2 text-muted-foreground"
                : "bg-accent text-accent-foreground hover:opacity-90",
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            开始克隆
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
