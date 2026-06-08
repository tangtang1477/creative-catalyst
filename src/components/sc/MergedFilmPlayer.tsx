import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Maximize2, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCButton } from "./Button";

interface Segment {
  id: string;
  label: string;
  url: string;
  duration: number; // seconds
}

interface Props {
  segments: Segment[];
}

function parseDuration(d?: string | number): number {
  if (typeof d === "number") return d;
  if (!d) return 0;
  const s = String(d);
  if (s.includes(":")) {
    const [m, sec] = s.split(":").map((x) => Number(x) || 0);
    return m * 60 + sec;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function MergedFilmPlayer({ segments }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0); // seconds within current segment
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const s of segments) {
      offsets.push(acc);
      acc += s.duration || 0;
    }
    return { offsets, total: acc };
  }, [segments]);

  const playedSeconds = (totals.offsets[idx] ?? 0) + curTime;
  const progressPct = totals.total > 0 ? (playedSeconds / totals.total) * 100 : 0;

  // When idx changes, load new src and (if was playing) continue
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurTime(0);
    if (playing) {
      v.play().catch(() => setPlaying(false));
    }
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!segments.length) return null;

  const cur = segments[idx];

  const handlePlayPause = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      try {
        await v.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const handleEnded = () => {
    if (idx < segments.length - 1) {
      setIdx(idx + 1);
    } else {
      setPlaying(false);
    }
  };

  const handleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
  };

  const handleSeek = (pct: number) => {
    if (totals.total <= 0) return;
    const target = (pct / 100) * totals.total;
    // find segment
    let i = 0;
    for (let k = 0; k < segments.length; k++) {
      if (target >= totals.offsets[k]) i = k;
    }
    const within = target - (totals.offsets[i] ?? 0);
    if (i !== idx) {
      setIdx(i);
      // after src changes, seek in onLoadedMetadata
      setTimeout(() => {
        const v = videoRef.current;
        if (v) v.currentTime = within;
      }, 50);
    } else {
      const v = videoRef.current;
      if (v) v.currentTime = within;
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExportError(null);
    setExporting(true);
    setExportProgress(0);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpeg.on("progress", ({ progress }) => {
        setExportProgress(Math.max(0, Math.min(1, progress)));
      });

      const listLines: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const name = `seg${i}.mp4`;
        await ffmpeg.writeFile(name, await fetchFile(segments[i].url));
        listLines.push(`file '${name}'`);
      }
      await ffmpeg.writeFile("list.txt", new TextEncoder().encode(listLines.join("\n")));

      // Try stream copy first (fast). Falls back to re-encode if codecs differ.
      let ok = false;
      try {
        await ffmpeg.exec([
          "-f", "concat", "-safe", "0",
          "-i", "list.txt",
          "-c", "copy",
          "out.mp4",
        ]);
        ok = true;
      } catch {
        ok = false;
      }
      if (!ok) {
        await ffmpeg.exec([
          "-f", "concat", "-safe", "0",
          "-i", "list.txt",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-c:a", "aac",
          "out.mp4",
        ]);
      }
      const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `final-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error("[merged-film] export failed", e);
      setExportError("导出失败，可逐段下载");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={cur.url}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          className="block w-full"
          style={{ aspectRatio: "9 / 16", maxHeight: 480, margin: "0 auto" }}
          onTimeUpdate={(e) => setCurTime(e.currentTarget.currentTime)}
          onEnded={handleEnded}
          onClick={handlePlayPause}
        />
      </div>

      {/* Segmented progress */}
      <div className="px-3 pt-2.5">
        <div
          className="relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            handleSeek(((e.clientX - r.left) / r.width) * 100);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-150"
            style={{ width: `${progressPct}%` }}
          />
          {/* segment dividers */}
          {totals.offsets.slice(1).map((o, i) => (
            <span
              key={i}
              className="absolute top-0 h-full w-px bg-black/60"
              style={{ left: `${(o / totals.total) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-white/70">
          <span>
            {playedSeconds.toFixed(1)}s / {totals.total.toFixed(1)}s
          </span>
          <span>
            {cur.label} · {idx + 1}/{segments.length}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={playing ? "暂停" : "播放"}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform hover:scale-105"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          aria-label="全屏"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {exporting && (
            <span className="font-mono text-[10.5px] text-white/70">
              合并中 {Math.round(exportProgress * 100)}%
            </span>
          )}
          {exportError && (
            <span className="text-[10.5px] text-status-failed">{exportError}</span>
          )}
          <SCButton
            variant="chip"
            size="sm"
            className="h-7 gap-1 px-2.5 text-[11px]"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            导出合并 MP4
          </SCButton>
        </div>
      </div>
    </div>
  );
}

export function buildSegmentsFromAssets(
  assets: Array<{ id: string; label: string; url?: string; duration?: string | number }>,
): Segment[] {
  return assets
    .filter((a) => !!a.url)
    .map((a) => ({
      id: a.id,
      label: a.label,
      url: a.url!,
      duration: parseDuration(a.duration) || 5,
    }));
}
