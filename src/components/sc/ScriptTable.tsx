import { SCRIPT_ROWS, STORYBOARD_ROWS } from "@/lib/sc/samples";

export function ScriptTable() {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-left text-muted-foreground">
            <th className="px-2.5 py-1.5 font-medium">Time</th>
            <th className="px-2.5 py-1.5 font-medium">Visual</th>
            <th className="px-2.5 py-1.5 font-medium">VO/Subtitles</th>
            <th className="px-2.5 py-1.5 font-medium">Sound</th>
          </tr>
        </thead>
        <tbody>
          {SCRIPT_ROWS.map((r, i) => (
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
          {STORYBOARD_ROWS.map((r, i) => (
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
