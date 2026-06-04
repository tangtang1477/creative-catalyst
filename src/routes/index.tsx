import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/sc/Sidebar";
import { Workspace } from "@/components/sc/Workspace";
import { MediaRail } from "@/components/sc/MediaRail";
import { DotGridBackground } from "@/components/sc/DotGridBackground";
import { useSC } from "@/lib/sc/store";
import { useCredits } from "@/lib/sc/credits-store";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/")({
  component: Index,
  errorComponent: IndexErrorComponent,
  head: () => ({
    meta: [
      { title: "vibe aideo — AI Ad-Video Agent for Commercials" },
      { name: "description", content: "Brief in, commercial out. vibe aideo turns product ideas into shoot-ready ad videos inside a dark, premium creative workstation." },
      { property: "og:title", content: "vibe aideo — AI Ad-Video Agent for Commercials" },
      { property: "og:description", content: "Brief in, commercial out. Turn product ideas into shoot-ready ad videos in minutes." },
      { property: "og:url", content: "https://auto-ad-director.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://auto-ad-director.lovable.app/" },
    ],
  }),
});

function IndexErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-[18px] font-semibold">工作区加载失败</h1>
        <p className="text-[12px] text-muted-foreground">{error?.message ?? "未知错误"}</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-accent px-4 py-1.5 text-[12px] text-accent-foreground"
          >
            重试
          </button>
          <Link to="/" className="rounded-full bg-surface-2 px-4 py-1.5 text-[12px]">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function Index() {
  const forceState = useSC((s) => s.forceState);
  const hydrateWorkspace = useSC((s) => s.hydrateFromStorage);
  const hydrateCredits = useCredits((s) => s.hydrateFromStorage);
  // initialise theme class on root <html>
  useTheme();

  useEffect(() => {
    hydrateWorkspace();
    hydrateCredits();
  }, [hydrateWorkspace, hydrateCredits]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("state");
    if (s) forceState(s);
  }, [forceState]);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
      <DotGridBackground />
      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <Workspace />
        <MediaRail />
      </div>
    </div>
  );
}
