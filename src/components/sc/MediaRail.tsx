import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";
import { Image as ImageIcon } from "lucide-react";

export function MediaRail() {
  const { assets, phase } = useSC();
  if (phase === "empty" || phase === "intake") return null;

  return (
    <aside className="hidden xl:flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between px-3 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          Gallery
        </div>
        <span>{assets.length} assets</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            等待生成…
          </div>
        ) : (
          <div className="space-y-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} compact />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
