import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/sc/Sidebar";
import { Workspace } from "@/components/sc/Workspace";
import { MediaRail } from "@/components/sc/MediaRail";
import { useSC } from "@/lib/sc/store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const forceState = useSC((s) => s.forceState);

  // Demo state override via ?state=ready|recovering|failed|...
  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.classList.add("dark");
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
