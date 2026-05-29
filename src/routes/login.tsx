import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/test" });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/test" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password: pwd,
          options: { emailRedirectTo: window.location.origin + "/test" },
        });
        if (error) throw error;
        setMsg("已发送验证邮件，请查收后登录。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (error) throw error;
      }
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  }

  async function handleGoogle() {
    setBusy(true); setMsg(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/test" });
    if (r.error) { setMsg((r.error as Error).message); setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">{mode === "signin" ? "登录" : "注册"}</h1>
        <form onSubmit={handleEmail} className="space-y-3">
          <input type="email" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground" />
          <input type="password" required minLength={6} placeholder="密码" value={pwd} onChange={(e) => setPwd(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground" />
          <button disabled={busy} className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? "..." : mode === "signin" ? "登录" : "注册"}
          </button>
        </form>
        <button onClick={handleGoogle} disabled={busy}
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50">
          使用 Google 登录
        </button>
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-xs text-muted-foreground hover:underline">
          {mode === "signin" ? "没有账号？注册" : "已有账号？登录"}
        </button>
        {msg && <p className="text-xs text-destructive">{msg}</p>}
      </div>
    </div>
  );
}
