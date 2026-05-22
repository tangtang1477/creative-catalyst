import { useEffect, useState } from "react";

interface Opts {
  typeMs?: number;
  holdMs?: number;
  eraseMs?: number;
  enabled?: boolean;
}

/**
 * Cycles through phrases with a typewriter effect.
 * Returns the current rendered string.
 */
export function useTypewriterPlaceholder(
  phrases: string[],
  { typeMs = 65, holdMs = 1500, eraseMs = 28, enabled = true }: Opts = {},
) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"type" | "hold" | "erase">("type");

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;
    const target = phrases[idx % phrases.length];
    let timer: number;
    if (mode === "type") {
      if (text.length < target.length) {
        timer = window.setTimeout(
          () => setText(target.slice(0, text.length + 1)),
          typeMs,
        );
      } else {
        timer = window.setTimeout(() => setMode("hold"), 0);
      }
    } else if (mode === "hold") {
      timer = window.setTimeout(() => setMode("erase"), holdMs);
    } else {
      if (text.length > 0) {
        timer = window.setTimeout(
          () => setText(target.slice(0, text.length - 1)),
          eraseMs,
        );
      } else {
        timer = window.setTimeout(() => {
          setIdx((i) => i + 1);
          setMode("type");
        }, 120);
      }
    }
    return () => window.clearTimeout(timer);
  }, [text, mode, idx, phrases, typeMs, holdMs, eraseMs, enabled]);

  // when disabled mid-flight, freeze
  return text;
}
