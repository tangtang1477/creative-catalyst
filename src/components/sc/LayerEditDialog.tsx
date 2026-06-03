import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Asset } from "@/lib/sc/types";
import { SCButton } from "./Button";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import { editAssetWithLayers } from "@/lib/image-edit.functions";
import { uploadBase64Image } from "@/lib/upload-image";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
}

const LAYER_PRESETS: Array<{ id: string; label: string; hint: string }> = [
  { id: "subject", label: "主体", hint: "人物 / 主角形象 / 主要道具" },
  { id: "background", label: "背景", hint: "场景 / 环境 / 天空" },
  { id: "lighting", label: "光影", hint: "色调 / 阴影 / 高光" },
  { id: "text", label: "文字", hint: "海报字 / 字幕" },
  { id: "color", label: "色彩", hint: "整体色调 / 滤镜" },
  { id: "style", label: "风格", hint: "材质 / 笔触 / 渲染风格" },
];

export function LayerEditDialog({ asset, open, onClose }: Props) {
  const addAssetVersion = useSC((s) => s.addAssetVersion);
  const taskId = useSC((s) => s.taskId);
  const assets = useSC((s) => s.assets);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!asset) return null;

  const toggleLayer = (id: string) =>
    setSelectedLayers((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  const toggleRef = (id: string) =>
    setSelectedRefs((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id],
    );

  const refCandidates = assets.filter(
    (a) =>
      a.id !== asset.id &&
      a.kind === "image" &&
      !!a.url &&
      a.status === "Ready" &&
      (a.stageId === "wardrobe" || a.stageId === "cast"),
  );

  const close = () => {
    if (busy) return;
    setSelectedLayers([]);
    setSelectedRefs([]);
    setPrompt("");
    onClose();
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text) {
      toast("请先描述要做的改动");
      return;
    }
    if (!asset.url) {
      toast("当前素材尚未生成完成");
      return;
    }
    setBusy(true);
    try {
      const { data: au } = await supabase.auth.getUser();
      const userId = au.user?.id;
      if (!userId) {
        toast("请先登录后再编辑");
        return;
      }
      const layerLabels = selectedLayers
        .map((id) => LAYER_PRESETS.find((p) => p.id === id)?.label)
        .filter((x): x is string => !!x);
      const refUrls = selectedRefs
        .map((id) => assets.find((a) => a.id === id)?.url)
        .filter((u): u is string => !!u && /^https?:\/\//.test(u));
      const imageUrls = [asset.url, ...refUrls].slice(0, 6);

      const { b64 } = await editAssetWithLayers({
        data: { prompt: text, imageUrls, layers: layerLabels.length ? layerLabels : undefined },
      });
      const url = await uploadBase64Image({
        base64: b64,
        userId,
        taskId: taskId ?? undefined,
      });
      addAssetVersion(asset.id, url, `图层编辑：${text.slice(0, 30)}`);
      toast.success("编辑完成，已保存为新版本");
      close();
    } catch (e) {
      console.error("[LayerEditDialog] failed", e);
      toast.error(`编辑失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-3xl border-border bg-surface p-0">
        <DialogHeader className="border-b border-border px-5 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-accent" />
            图层编辑 · {asset.label}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_320px] gap-0">
          {/* 左：原图预览 */}
          <div className="flex items-center justify-center bg-black/40 p-4">
            {asset.url ? (
              <img
                src={asset.url}
                alt={asset.label}
                className="max-h-[480px] w-auto rounded-lg object-contain"
              />
            ) : (
              <div className="text-sm text-muted-foreground">尚未生成</div>
            )}
          </div>
          {/* 右：控件 */}
          <div className="flex flex-col gap-4 border-l border-border p-4">
            <section>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                只改这些图层
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LAYER_PRESETS.map((p) => {
                  const on = selectedLayers.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.hint}
                      onClick={() => toggleLayer(p.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                        on
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-surface-2 text-foreground/80 hover:border-accent/50",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">
                不选则按 prompt 整体改图
              </div>
            </section>

            {refCandidates.length > 0 && (
              <section>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  参考素材（最多 4）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {refCandidates.slice(0, 12).map((r) => {
                    const on = selectedRefs.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRef(r.id)}
                        className={cn(
                          "relative h-12 w-12 overflow-hidden rounded-lg border transition-all",
                          on ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50",
                        )}
                        title={r.caption ?? r.label}
                      >
                        <img src={r.url!} alt={r.label} className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[9px] text-white">
                          {r.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="flex flex-1 flex-col">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                改图指令
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例：把背景换成雨夜霓虹街道，保留人物服装和姿势"
                disabled={busy}
                rows={4}
                className="min-h-[96px] flex-1 resize-none rounded-lg border border-border bg-background/40 p-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-accent/60 focus:outline-none"
              />
            </section>

            <div className="flex items-center justify-end gap-2 pt-1">
              <SCButton
                variant="chip"
                size="sm"
                onClick={close}
                disabled={busy}
                className="h-8"
              >
                <X className="h-3 w-3" />
                取消
              </SCButton>
              <SCButton
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={busy || !prompt.trim()}
                className="h-8 gap-1.5"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {busy ? "正在编辑…" : "应用编辑"}
              </SCButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
