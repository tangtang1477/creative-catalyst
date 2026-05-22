import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/sc/Sidebar";
import { Workspace } from "@/components/sc/Workspace";
import { MediaRail } from "@/components/sc/MediaRail";
import { useSC } from "@/lib/sc/store";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const forceState = useSC((s) => s.forceState);
  // initialise theme class on root <html>
  useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("state");
    if (s) forceState(s);
  }, [forceState]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <Workspace />
      <MediaRail />
    </div>
  );
}
