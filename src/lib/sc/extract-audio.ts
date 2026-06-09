/**
 * Lazily-loaded client-side audio extraction from generated video segments.
 * Uses the already-installed @ffmpeg/ffmpeg + @ffmpeg/util (same CDN core as
 * MergedFilmPlayer). The returned URL is a `blob:` URL valid for the page
 * lifetime — fine for in-task preview + download.
 */

let ffmpegInstance: unknown | null = null;
let loadPromise: Promise<unknown> | null = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();
  return loadPromise;
}

export interface ExtractedAudio {
  url: string;
  mime: string;
}

/**
 * Extract an mp3 (fallback aac/m4a) audio track from a remote video URL.
 * Returns { url:"", mime:"" } if the video has no audio stream.
 */
export async function extractAudioFromVideo(
  videoUrl: string,
  outName: string,
): Promise<ExtractedAudio> {
  const ff = (await getFFmpeg()) as {
    writeFile: (n: string, d: Uint8Array) => Promise<void>;
    readFile: (n: string) => Promise<Uint8Array>;
    exec: (args: string[]) => Promise<void>;
    deleteFile?: (n: string) => Promise<void>;
  };
  const { fetchFile } = await import("@ffmpeg/util");

  const inName = `in_${outName}.mp4`;
  await ff.writeFile(inName, await fetchFile(videoUrl));

  // Try mp3 first, fall back to aac/m4a
  const attempts: Array<{ args: string[]; out: string; mime: string }> = [
    {
      args: ["-i", inName, "-vn", "-acodec", "libmp3lame", "-b:a", "128k", `${outName}.mp3`],
      out: `${outName}.mp3`,
      mime: "audio/mpeg",
    },
    {
      args: ["-i", inName, "-vn", "-acodec", "aac", "-b:a", "128k", `${outName}.m4a`],
      out: `${outName}.m4a`,
      mime: "audio/mp4",
    },
  ];

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      await ff.exec(a.args);
      const data = await ff.readFile(a.out);
      if (!data || data.length === 0) {
        lastErr = new Error("empty output");
        continue;
      }
      const blob = new Blob([data.buffer as ArrayBuffer], { type: a.mime });
      const url = URL.createObjectURL(blob);
      // cleanup virtual fs
      try {
        await ff.deleteFile?.(inName);
        await ff.deleteFile?.(a.out);
      } catch {
        /* ignore */
      }
      return { url, mime: a.mime };
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    await ff.deleteFile?.(inName);
  } catch {
    /* ignore */
  }

  const msg = String((lastErr as Error)?.message ?? lastErr ?? "");
  // No audio track → quietly return empty
  if (/matches no streams|does not contain any stream/i.test(msg)) {
    return { url: "", mime: "" };
  }
  console.warn("[extract-audio] failed:", msg);
  return { url: "", mime: "" };
}
