import { useMemo } from "react";
import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";

/** Wardrobe + props asset gallery — renders cards from the wardrobe stage. */
export function WardrobePanel() {
  // Select the full assets array (stable reference) then filter in render to
  // avoid returning a fresh array from the zustand selector on every store
  // update — which would trigger an infinite useSyncExternalStore loop.
  const allAssets = useSC((s) => s.assets);
  const assets = useMemo(
    () => allAssets.filter((a) => a.stageId === "wardrobe"),
    [allAssets],
  );
  if (!assets.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {assets.map((a) => (
        <AssetCard key={a.id} asset={a} compact />
      ))}
    </div>
  );
}
