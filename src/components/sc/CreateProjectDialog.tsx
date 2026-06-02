import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Settings, X, Smile, DollarSign, GraduationCap, PenTool, Plane, Loader2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects, type ProjectKind } from "@/lib/sc/projects-store";
import { supabase } from "@/integrations/supabase/client";

const KIND_OPTIONS: { kind: ProjectKind; label: string; Icon: typeof DollarSign; color: string }[] = [
  { kind: "investment", label: "投资", Icon: DollarSign, color: "text-emerald-400" },
  { kind: "homework", label: "作业", Icon: GraduationCap, color: "text-sky-400" },
  { kind: "writing", label: "写作", Icon: PenTool, color: "text-violet-400" },
  { kind: "travel", label: "旅行", Icon: Plane, color: "text-amber-400" },
];

/** Pixel-faithful "创建项目" dialog (see uploaded image-40.png). */
export function CreateProjectDialog() {
  const navigate = useNavigate();
  const open = useProjects((s) => s.createOpen);
  const draft = useProjects((s) => s.draft);
  const close = useProjects((s) => s.closeCreate);
  const create = useProjects((s) => s.create);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("travel");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(draft?.name ?? "");
    setKind(draft?.kind ?? "travel");
    setErr(null);
  }, [open, draft]);

  const canSubmit = name.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      // Guard: must be authenticated
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        close();
        navigate({ to: "/login" });
        return;
      }
      await create({ name: name.trim(), kind, icon: kind });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="max-w-[520px] gap-0 border border-border bg-surface p-0 [&>button.absolute]:hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <DialogTitle className="text-[20px] font-semibold tracking-tight text-foreground">
            创建项目
          </DialogTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="close"
              onClick={close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Name input */}
        <div className="px-6">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 transition-colors focus-within:border-accent/60">
            <Smile className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="哥本哈根之旅"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>

        {/* Kind chips */}
        <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
          {KIND_OPTIONS.map(({ kind: k, label, Icon, color }) => {
            const active = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-all",
                  active
                    ? "border-accent/70 bg-accent/15 text-foreground"
                    : "border-border bg-surface-2/40 text-foreground hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <Icon className={cn("h-4 w-4", color)} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Tip box */}
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            项目功能可将聊天、文件和自定义指令集中保存，以便用于持续进行的工作，或者单纯用于整理内容，让一切更井然有序。
          </span>
        </div>

        {err && (
          <p className="px-6 pt-3 text-[12px] text-destructive">{err}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end px-6 pb-5 pt-5">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-all",
              canSubmit
                ? "bg-accent text-accent-foreground hover:opacity-90"
                : "cursor-not-allowed bg-surface-2 text-muted-foreground",
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            创建项目
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
