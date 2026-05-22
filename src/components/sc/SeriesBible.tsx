import { useSC } from "@/lib/sc/store";
import { detectVideoType } from "@/lib/sc/video-types";

/**
 * Compact Series Bible + Continuity Registry rendered above stages
 * when the project is detected as a series. Mirrors skill spec.
 */
export function SeriesBible() {
  const { brief, taskTitle } = useSC();
  const type = detectVideoType(brief?.prompt ?? "", brief?.adType);
  if (type !== "series") return null;

  return (
    <div className="space-y-3 [animation:stream-fade_320ms_ease-out_both]">
      <div className="rounded-2xl border border-accent/30 bg-[color-mix(in_oklab,var(--accent)_6%,var(--surface))] px-3.5 py-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            Series Bible
          </span>
          <span className="text-[11px] text-muted-foreground">S01 · 6 episodes · 30-60s</span>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <li><span className="text-foreground/85">Logline · </span>{taskTitle}</li>
          <li><span className="text-foreground/85">World rules · </span>—</li>
          <li><span className="text-foreground/85">Recurring cast · </span>C01, C02</li>
          <li><span className="text-foreground/85">Standing sets · </span>E01, E02</li>
          <li><span className="text-foreground/85">Core conflict · </span>—</li>
          <li><span className="text-foreground/85">Visual grammar · </span>—</li>
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Episode Registry
        </div>
        <table className="w-full border-collapse text-[12px]">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Episode</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              <th className="px-3 py-1.5 font-medium">Story Function</th>
              <th className="px-3 py-1.5 font-medium">Cliffhanger</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">S01E01</td>
              <td className="px-3 py-1.5 text-accent">Generating</td>
              <td className="px-3 py-1.5">Opens the mystery</td>
              <td className="px-3 py-1.5 text-muted-foreground">门再次出现</td>
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">S01E02</td>
              <td className="px-3 py-1.5 text-muted-foreground">Planned</td>
              <td className="px-3 py-1.5">Escalates conflict</td>
              <td className="px-3 py-1.5 text-muted-foreground">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Continuity Registry
        </div>
        <table className="w-full border-collapse text-[12px]">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">ID</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="px-3 py-1.5 font-medium">Description</th>
              <th className="px-3 py-1.5 font-medium">First Seen</th>
              <th className="px-3 py-1.5 font-medium">Reuse Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">C01</td>
              <td className="px-3 py-1.5">Character</td>
              <td className="px-3 py-1.5">主角</td>
              <td className="px-3 py-1.5 font-mono">S01E01</td>
              <td className="px-3 py-1.5 text-muted-foreground">same face / wardrobe</td>
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">E01</td>
              <td className="px-3 py-1.5">Environment</td>
              <td className="px-3 py-1.5">老宅走廊</td>
              <td className="px-3 py-1.5 font-mono">S01E01</td>
              <td className="px-3 py-1.5 text-muted-foreground">same layout / lighting</td>
            </tr>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">P01</td>
              <td className="px-3 py-1.5">Prop · Clue</td>
              <td className="px-3 py-1.5">古旧钥匙</td>
              <td className="px-3 py-1.5 font-mono">S01E01</td>
              <td className="px-3 py-1.5 text-muted-foreground">track unresolved state</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
