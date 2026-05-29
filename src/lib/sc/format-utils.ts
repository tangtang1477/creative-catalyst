/** Parse a "15s · 9:16" style format string and return the seconds. */
export function parseFormatDuration(format: string | undefined | null): number {
  if (!format) return 5;
  const m = format.match(/(\d+)\s*s/i);
  if (!m) return 5;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return n;
}

/** Parse a "15s · 9:16" style format string and return the ratio (e.g. "9:16"). */
export function parseFormatRatio(format: string | undefined | null): string {
  if (!format) return "9:16";
  const m = format.match(/(\d+):(\d+)/);
  return m ? `${m[1]}:${m[2]}` : "9:16";
}

export function formatDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
