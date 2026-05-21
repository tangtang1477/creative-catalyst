import {
  Hammer,
  Video,
  Megaphone,
  Film,
  Wand2,
  Import,
  ArrowRight,
} from "lucide-react";
import { SCButton } from "./Button";
import { useSC } from "@/lib/sc/store";

const chips = [
  { id: "build", label: "Build with skills", icon: Hammer, badge: "New" },
  { id: "ugc", label: "Create UGC", icon: Video },
  { id: "marketing", label: "Run marketing", icon: Megaphone },
  { id: "cinema", label: "Short cinema", icon: Film },
  { id: "cartoon", label: "Animate cartoon", icon: Wand2 },
];

const followups = [
  { icon: ArrowRight, text: "Create a marketing video using /ugc-flow" },
  { icon: ArrowRight, text: "Discover skills from the community" },
  {
    icon: Import,
    text: "Import skills & memory from Claude, ChatGPT, Codex, Hermes Agent and OpenClaw",
    accent: true,
  },
];

export function SuggestionChips() {
  const { setPrompt } = useSC();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <SCButton
            key={c.id}
            variant="chip"
            size="sm"
            onClick={() => setPrompt(c.label)}
            className="gap-1.5"
          >
            <c.icon className="h-3.5 w-3.5" />
            <span>{c.label}</span>
            {c.badge && (
              <span className="ml-0.5 rounded bg-accent/25 px-1 py-0.5 text-[10px] text-accent-foreground">
                {c.badge}
              </span>
            )}
          </SCButton>
        ))}
        <SCButton variant="chip" size="sm" className="gap-1.5">
          <Import className="h-3.5 w-3.5" />
          <span>Import skills & memory</span>
        </SCButton>
      </div>

      <div className="space-y-2 pt-1">
        {followups.map((f, i) => (
          <button
            key={i}
            className="group flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <f.icon
              className={
                f.accent
                  ? "h-3.5 w-3.5 text-status-failed"
                  : "h-3.5 w-3.5 text-muted-foreground group-hover:text-accent"
              }
            />
            <span>{f.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
