import { LayoutList, Workflow } from "lucide-react";
import { useSC } from "@/lib/sc/store";
import { cn } from "@/lib/utils";

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useSC();
  return (
    <div className="inline-flex items-center rounded-full bg-surface-2 p-0.5">
      <button
        type="button"
        onClick={() => setViewMode("list")}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] transition-colors",
          viewMode === "list"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="列表视图"
      >
        <LayoutList className="h-3 w-3" />
        List
      </button>
      <button
        type="button"
        onClick={() => setViewMode("canvas")}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] transition-colors",
          viewMode === "canvas"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="画布视图"
      >
        <Workflow className="h-3 w-3" />
        Canvas
      </button>
    </div>
  );
}
