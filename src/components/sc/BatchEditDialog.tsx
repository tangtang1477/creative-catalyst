import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";
import { Sparkles, Zap } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BatchEditDialog({ open, onOpenChange }: Props) {
  const { selection, assets, batchEditAssets } = useSC();
  const [text, setText] = useState("");
  const targets = assets.filter((a) => selection.includes(a.id));

  const onSubmit = () => {
    if (!text.trim() || !selection.length) return;
    batchEditAssets(selection, text.trim());
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] border-border bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Sparkles className="h-4 w-4 text-accent" />
            批量修改素材 · {selection.length} 项
          </DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            统一指令将通过快模型批量重生成。
            <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10.5px] text-accent">
              Fast model · 0 credits · Preview
            </span>
          </DialogDescription>
        </DialogHeader>

        {targets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {targets.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-[11px]"
              >
                {a.url && a.kind === "image" && (
                  <img src={a.url} alt="" className="h-5 w-5 rounded object-cover" />
                )}
                <span className="font-mono text-accent">{a.label}</span>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：全部换成夜景 / 把主角衣服换成红色 / 加更多电影感颗粒…"
          className="min-h-[80px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-accent"
        />

        <DialogFooter>
          <SCButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </SCButton>
          <SCButton variant="primary" size="sm" onClick={onSubmit}>
            <Zap className="h-3.5 w-3.5" />
            开始批量修改
          </SCButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
