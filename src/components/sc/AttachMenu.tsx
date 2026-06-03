import { useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Link2, Image as ImageIcon, Film, Music, FileText, Loader2 } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { useVoices } from "@/lib/sc/voices-store";
import { uploadGenericFile } from "@/lib/upload-image";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/lib/sc/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


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

type AcceptKind = "image" | "video" | "audio" | "any";

export function AttachMenu({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { addAttachment, assets } = useSC();
  const setPendingScript = useSC((s) => s.setPendingScript);
  const pendingScript = useSC((s) => s.pendingScript);

  const clone = useVoices((s) => s.clone);
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [acceptKind, setAcceptKind] = useState<AcceptKind>("any");
  const [scriptBusy, setScriptBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLInputElement>(null);

  const triggerFile = (k: AcceptKind) => {
    setAcceptKind(k);
    requestAnimationFrame(() => fileRef.current?.click());
  };
  const triggerScript = () => {
    requestAnimationFrame(() => scriptRef.current?.click());
  };

  const onScriptFile = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    setOpen(false);
    setScriptBusy(true);
    try {
      let text = "";
      const name = file.name.toLowerCase();
      if (file.size > 20 * 1024 * 1024) {
        toast.error("剧本文件不能超过 20 MB");
        return;
      }
      if (name.endsWith(".docx")) {
        const mammothMod = (await import("mammoth/mammoth.browser")) as unknown as {
          extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const arrayBuffer = await file.arrayBuffer();
        const res = await mammothMod.extractRawText({ arrayBuffer });
        text = res.value ?? "";
      } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const { extractPdfText } = await import("@/lib/script-parse.functions");
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const base64 = btoa(bin);
        toast("正在提取 PDF 文本…");
        const res = await extractPdfText({ data: { base64 } });
        text = res.text ?? "";
      } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text")) {
        text = await file.text();
      } else {
        toast.error("暂只支持 .txt / .md / .docx / .pdf 剧本上传");
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error("剧本内容为空");
        return;
      }
      const source: "txt" | "md" | "docx" | "pdf" = name.endsWith(".docx")
        ? "docx"
        : name.endsWith(".pdf") || file.type === "application/pdf"
          ? "pdf"
          : name.endsWith(".md")
            ? "md"
            : "txt";
      // 只暂存原文，不立刻解析。等用户在输入框写下意图后，submit 时再连同
      // prompt 一起送 parseScriptText，确保解析忠实于"剧本 + 用户意图"。
      setPendingScript({
        text: trimmed.slice(0, 60000),
        fileName: file.name,
        source,
        uploadedAt: Date.now(),
      });
      toast.success(`已读取剧本「${file.name}」 · 现在请在输入框告诉我你的拍摄意图，回车后我会按你的指令解析这份剧本。`);
    } catch (e) {
      console.error("[script upload] failed", e);
      toast.error(`剧本读取失败：${(e as Error).message}`);
    } finally {
      setScriptBusy(false);
      if (scriptRef.current) scriptRef.current.value = "";
    }
  };



  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setOpen(false);
    for (const file of arr) {
      const mime = file.type || "";
      const kind: "image" | "video" | "audio" = mime.startsWith("video")
        ? "video"
        : mime.startsWith("audio")
          ? "audio"
          : "image";

      // Audio: upload to storage then offer to clone as a voice
      if (kind === "audio") {
        try {
          const { data: au } = await supabase.auth.getUser();
          if (!au.user) {
            // Fallback: ephemeral object URL only
            const url = URL.createObjectURL(file);
            addAttachment({
              id: aid(),
              kind: "audio",
              name: file.name,
              url,
              source: "upload",
            });
            continue;
          }
          const url = await uploadGenericFile({
            file,
            userId: au.user.id,
          });
          addAttachment({
            id: aid(),
            kind: "audio",
            name: file.name,
            url,
            source: "upload",
          });
          const want = window.confirm(
            `已上传 “${file.name}”。是否将其克隆为一个新音色加入音色库？`,
          );
          if (want) {
            const voiceName = (file.name.replace(/\.[^/.]+$/, "") || "我的音色").slice(0, 60);
            try {
              await clone({ name: voiceName, audio_url: url });
            } catch (e) {
              console.error("[clone voice] failed", e);
              window.alert(`音色克隆失败：${(e as Error).message}`);
            }
          }
        } catch (e) {
          console.error("[audio upload] failed", e);
        }
        continue;
      }

      // image / video
      const url = URL.createObjectURL(file);
      addAttachment({
        id: aid(),
        kind,
        name: file.name,
        url,
        thumb: kind === "image" ? url : undefined,
        source: "upload",
      });
    }
  };

  const onUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    const isVideo = /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(v);
    const isAudio = /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(v);
    const kind: Attachment["kind"] = isVideo ? "video" : isAudio ? "audio" : "image";
    addAttachment({
      id: aid(),
      kind,
      name: v.split("/").pop() || v,
      url: v,
      thumb: !isVideo && !isAudio ? v : undefined,
      source: "url",
    });
    setUrlInput("");
    setOpen(false);
  };

  const acceptAttr =
    acceptKind === "image"
      ? "image/*"
      : acceptKind === "video"
        ? "video/*"
        : acceptKind === "audio"
          ? "audio/*"
          : "image/*,video/*,audio/*";

  const readyAssets = assets.filter((a) => a.status === "Ready" && a.url);

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild disabled={disabled}>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[290px] rounded-2xl border-border bg-surface p-1.5 shadow-xl"
      >
        <input
          ref={fileRef}
          type="file"
          accept={acceptAttr}
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <input
          ref={scriptRef}
          type="file"
          accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => onScriptFile(e.target.files)}
        />

        <div className="px-2.5 pb-1 pt-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">媒体</div>
        <Row
          icon={<Upload className="h-3.5 w-3.5" />}
          label="上传文件 · 图片/视频/音频"
          onClick={() => triggerFile("any")}
        />

        <div className="grid grid-cols-3 gap-1 px-1.5 pt-1">
          <button
            type="button"
            onClick={() => triggerFile("image")}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-surface-2/60 px-2 py-1.5 text-[11px] text-foreground/85 hover:bg-surface-2 hover:text-accent"
          >
            <ImageIcon className="h-3 w-3" />
            图片
          </button>
          <button
            type="button"
            onClick={() => triggerFile("video")}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-surface-2/60 px-2 py-1.5 text-[11px] text-foreground/85 hover:bg-surface-2 hover:text-accent"
          >
            <Film className="h-3 w-3" />
            视频
          </button>
          <button
            type="button"
            onClick={() => triggerFile("audio")}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-surface-2/60 px-2 py-1.5 text-[11px] text-foreground/85 hover:bg-surface-2 hover:text-accent"
          >
            <Music className="h-3 w-3" />
            音频
          </button>
        </div>

        <div className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-foreground/70">
            <Link2 className="h-3.5 w-3.5" />
          </span>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onUrl())}
            placeholder="粘贴图片/视频/音频 URL"
            className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="mt-1.5 border-t border-border/60 pt-1">
          <div className="px-2.5 pb-1 pt-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">剧本</div>
          <Row
            icon={scriptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            label={scriptBusy ? "正在解析剧本…" : "上传剧本 · .txt / .md / .docx / .pdf"}
            onClick={scriptBusy ? undefined : triggerScript}
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
