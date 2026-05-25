import { useSC } from "@/lib/sc/store";
import { AssetCard } from "./AssetCard";

/** Wardrobe + props asset gallery — renders cards from the wardrobe stage. */
export function WardrobePanel() {
  const assets = useSC((s) =>
    s.assets.filter((a) => a.stageId === "wardrobe"),
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
