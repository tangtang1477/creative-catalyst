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

/**
 * Doubao Seedance 2.0 (i2v / first-frame-to-video) only accepts 5 or 10 second
 * durations. Clamp arbitrary user-requested durations to the nearest legal
 * value, capped at 10s. Returns { duration, clamped } so callers can surface
 * a note when the value was changed.
 */
export function clampSeedanceDuration(seconds: number): {
  duration: 5 | 10;
  clamped: boolean;
} {
  const n = Number.isFinite(seconds) ? Math.round(seconds) : 5;
  if (n <= 5) return { duration: 5, clamped: n !== 5 };
  if (n <= 7) return { duration: 5, clamped: true };
  return { duration: 10, clamped: n !== 10 };
}
