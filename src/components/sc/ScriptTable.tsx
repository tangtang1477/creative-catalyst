import { useSC } from "@/lib/sc/store";
import { SCRIPT_ROWS, STORYBOARD_ROWS } from "@/lib/sc/samples";

function parseSec(d: string): number {
  const m = d.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function ScriptTable() {
  const script = useSC((s) => s.script);

  const rows = (() => {
    if (!script?.shots?.length) return SCRIPT_ROWS;
    let t = 0;
    return script.shots.map((s) => {
      const dur = parseSec(s.duration);
      const time = `${t}–${t + dur}s`;
      t += dur;
      return {
        time,
        visual: s.scene,
        vo: s.elements,
        sound: s.motion,
      };
    });
  })();

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-left text-muted-foreground">
            <th className="px-2.5 py-1.5 font-medium">Time</th>
            <th className="px-2.5 py-1.5 font-medium">Visual</th>
            <th className="px-2.5 py-1.5 font-medium">Elements</th>
            <th className="px-2.5 py-1.5 font-medium">Motion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.time}</td>
              <td className="px-2.5 py-1.5">{r.visual}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.vo}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.sound}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StoryboardTable() {
  const script = useSC((s) => s.script);
  const rows =
    script?.shots?.length
      ? script.shots.map((s) => ({
          shot: s.shot,
          duration: s.duration,
          motion: s.motion,
          scene: s.scene,
          elements: s.elements,
        }))
      : STORYBOARD_ROWS;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-left text-muted-foreground">
            <th className="px-2.5 py-1.5 font-medium">Shot</th>
            <th className="px-2.5 py-1.5 font-medium">Duration</th>
            <th className="px-2.5 py-1.5 font-medium">Camera/Motion</th>
            <th className="px-2.5 py-1.5 font-medium">Scene</th>
            <th className="px-2.5 py-1.5 font-medium">Key Elements</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2.5 py-1.5 font-medium">{r.shot}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.duration}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.motion}</td>
              <td className="px-2.5 py-1.5">{r.scene}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.elements}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
