import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { streamGenerateImage, uploadBase64Image } from "@/lib/upload-image";
import { submitVideoTask, pollVideoTask } from "@/lib/wan.functions";

export const Route = createFileRoute("/test")({
  component: TestPage,
});

type Log = { t: number; label: string; data: unknown };

function TestPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [prompt, setPrompt] = useState("a cinematic shot of a red fox running through snow");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("idle");
  const [ossUrl, setOssUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const submitFn = useServerFn(submitVideoTask);
  const pollFn = useServerFn(pollVideoTask);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  function log(label: string, data: unknown) {
    setLogs((l) => [{ t: Date.now(), label, data }, ...l].slice(0, 50));
  }

  async function step1Image() {
    if (!userId) return;
    setBusy("生图中..."); setErr(null); setPreviewUrl(null); setImageUrl(null);
    setTaskId(null); setOssUrl(null); setPollStatus("idle");
    try {
      const b64 = await streamGenerateImage({
        prompt, quality: "low",
        onPartial: (url) => setPreviewUrl(url),
      });
      setPreviewUrl(`data:image/png;base64,${b64}`);
      log("image.completed", { len: b64.length });
      const url = await uploadBase64Image({ base64: b64, userId });
      setImageUrl(url);
      log("storage.uploaded", { url });
    } catch (e) {
      setErr((e as Error).message);
      log("image.error", (e as Error).message);
    } finally { setBusy(null); }
  }

  async function step2Submit() {
    if (!imageUrl) return;
    setBusy("提交视频..."); setErr(null);
    try {
      const r = await submitFn({
        data: {
          route: "first-frame-to-video",
          payload: { prompt, image_url: imageUrl, ratio: "16:9" },
        },
      });
      setTaskId(r.taskId); setPollStatus("processing");
      log("video.submitted", r);
      startPolling(r.taskId);
    } catch (e) {
      setErr((e as Error).message);
      log("video.submit.error", (e as Error).message);
    } finally { setBusy(null); }
  }

  function startPolling(taskIdArg: string) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    const started = Date.now();
    const tick = async () => {
      try {
        const r = await pollFn({ data: { taskId: taskIdArg } });
        setPollStatus(`${r.status} ${r.progress}%`);
        log("video.poll", r);
        if (r.ossUrl) setOssUrl(r.ossUrl);
        if (r.status === "success" || r.status === "failed") {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
        }
        if (Date.now() - started > 5 * 60_000) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setPollStatus("timeout");
        }
      } catch (e) {
        log("video.poll.error", (e as Error).message);
      }
    };
    tick();
    pollTimer.current = window.setInterval(tick, 3000);
  }

  useEffect(() => () => { if (pollTimer.current) window.clearInterval(pollTimer.current); }, []);

  if (!authReady) return <div className="p-8 text-muted-foreground">...</div>;
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button onClick={() => navigate({ to: "/login" })}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">
          请先登录
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">后端联调测试 /test</h1>
        <button onClick={() => supabase.auth.signOut()}
          className="text-xs text-muted-foreground hover:underline">登出</button>
      </header>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <label className="text-xs text-muted-foreground">Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
          className="w-full rounded border border-input bg-background p-2 text-sm text-foreground" />
        <div className="flex gap-2">
          <button onClick={step1Image} disabled={!!busy}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            1. 生图 + 存桶
          </button>
          <button onClick={step2Submit} disabled={!!busy || !imageUrl}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            2. 提视频 + 轮询
          </button>
        </div>
        {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs text-muted-foreground">图片</div>
          {previewUrl ? (
            <img src={previewUrl} alt="" className={imageUrl ? "" : "blur-md"} />
          ) : <div className="aspect-square bg-muted" />}
          {imageUrl && <p className="mt-2 break-all text-[10px] text-muted-foreground">{imageUrl}</p>}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs text-muted-foreground">
            视频 · task_id: {taskId ?? "-"} · status: {pollStatus}
          </div>
          {ossUrl ? (
            <>
              <video src={ossUrl} controls className="w-full" />
              <p className="mt-2 break-all text-[10px] text-muted-foreground">{ossUrl}</p>
            </>
          ) : <div className="aspect-video bg-muted" />}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 text-xs text-muted-foreground">日志</div>
        <div className="max-h-80 space-y-1 overflow-auto font-mono text-[11px]">
          {logs.map((l) => (
            <div key={l.t} className="border-b border-border/40 pb-1">
              <span className="text-muted-foreground">{new Date(l.t).toLocaleTimeString()} </span>
              <span className="text-primary">{l.label}</span>
              <pre className="mt-0.5 whitespace-pre-wrap text-foreground/80">
                {typeof l.data === "string" ? l.data : JSON.stringify(l.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
