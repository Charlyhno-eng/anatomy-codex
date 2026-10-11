import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
export const DEFAULT_GIF_BYTES = 3 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 8;

export interface GifOptions {
  maxBytes?: number;
  signal?: AbortSignal;
}
export interface GifResult {
  data: Buffer;
  width: number;
  height: number;
  fps: number;
  colors: number;
  attempts: number;
  duration: number;
  palette: "global" | "frame";
}

export class GifError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export async function runProcess(binary: string, args: string[], signal?: AbortSignal, timeout = 60000): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let expired = false;
    const timer = setTimeout(() => { expired = true; child.kill("SIGKILL"); }, timeout);
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-100000); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.once("error", error => {
      cleanup();
      reject(new GifError((error as NodeJS.ErrnoException).code === "ENOENT"
        ? `${binary} is unavailable. Install FFmpeg and restart the web interface.` : error.message, 503));
    });
    child.once("close", code => {
      cleanup();
      if (signal?.aborted) reject(signal.reason ?? new Error("Export cancelled."));
      else if (expired) reject(new GifError("Encoding timed out. Try a shorter recording.", 504));
      else if (code !== 0) reject(new GifError(`The recording could not be processed. ${stderr.trim().slice(-600)}`));
      else resolve(stdout);
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runProcess(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"], undefined, 5000);
    await runProcess(process.env.FFPROBE_PATH ?? "ffprobe", ["-version"], undefined, 5000);
    return true;
  } catch { return false; }
}

export async function encodeGif(video: Buffer, options: GifOptions = {}): Promise<GifResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_GIF_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > DEFAULT_GIF_BYTES) throw new GifError("Invalid GIF size limit.", 400);
  if (!video.length || video.length > MAX_UPLOAD_BYTES) throw new GifError("The recording is empty or exceeds 32 MiB.", 413);
  const signal = AbortSignal.any([AbortSignal.timeout(90000), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  const folder = await mkdtemp(join(tmpdir(), "anatomy-gif-"));
  try {
    const input = join(folder, "recording.webm");
    const output = join(folder, "animation.gif");
    await writeFile(input, video);
    const probe = JSON.parse(await runProcess(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0", "-show_entries",
      "stream=width,height,codec_name:format=duration", "-of", "json", input,
    ], signal, 10000));
    const stream = probe.streams?.[0];
    if (!stream || !["vp8", "vp9", "av1"].includes(stream.codec_name) || stream.width < 16 || stream.height < 16 || stream.width > 4096 || stream.height > 4096) {
      throw new GifError("The recording must be a WebM video with dimensions between 16 and 4096 pixels.");
    }
    const sourceDuration = Number(probe.format?.duration);
    if (Number.isFinite(sourceDuration) && (sourceDuration < 0.1 || sourceDuration > MAX_DURATION_SECONDS + 2)) throw new GifError("The recording duration is invalid.");
    const duration = Math.min(Number.isFinite(sourceDuration) ? sourceDuration : MAX_DURATION_SECONDS, MAX_DURATION_SECONDS);
    const colorStats = await runProcess(process.env.FFMPEG_PATH ?? "ffmpeg", ["-v", "error", "-threads", "1", "-filter_threads", "1",
      "-protocol_whitelist", "file,pipe", "-i", input, "-t", String(duration), "-vf",
      "fps=4,scale=64:64,signalstats,metadata=mode=print:file=-", "-an", "-f", "null", "-"], signal);
    const span = (channel: string) => {
      const values = [...colorStats.matchAll(new RegExp(`lavfi\\.signalstats\\.${channel}AVG=([\\d.]+)`, "g"))].map(match => Number(match[1]));
      return values.length ? Math.max(...values) - Math.min(...values) : 0;
    };
    const palette = span("U") > 12 || span("V") > 12 || span("Y") > 28 ? "frame" : "global";
    const presets = palette === "frame" ? [
      { width: 720, fps: 20, colors: 256, dither: "sierra2_4a" },
      { width: 720, fps: 15, colors: 256, dither: "sierra2_4a" },
      { width: 640, fps: 15, colors: 256, dither: "sierra2_4a" },
      { width: 640, fps: 15, colors: 192, dither: "sierra2_4a" },
      { width: 560, fps: 15, colors: 192, dither: "sierra2_4a" },
      { width: 480, fps: 15, colors: 128, dither: "sierra2_4a" },
      { width: 480, fps: 12, colors: 128, dither: "sierra2_4a" },
    ] : [
      { width: 720, fps: 20, colors: 256, dither: "bayer:bayer_scale=5" },
      { width: 720, fps: 20, colors: 256, dither: "none" },
      { width: 720, fps: 15, colors: 256, dither: "bayer:bayer_scale=5" },
      { width: 640, fps: 15, colors: 256, dither: "bayer:bayer_scale=5" },
      { width: 640, fps: 15, colors: 192, dither: "bayer:bayer_scale=5" },
      { width: 560, fps: 15, colors: 192, dither: "bayer:bayer_scale=5" },
      { width: 480, fps: 15, colors: 128, dither: "bayer:bayer_scale=5" },
      { width: 480, fps: 12, colors: 128, dither: "bayer:bayer_scale=5" },
    ];
    for (const [index, preset] of presets.entries()) {
      const width = Math.min(stream.width, preset.width, Math.floor(720 * stream.width / stream.height));
      const height = Math.max(1, Math.round(width * stream.height / stream.width));
      const filter = `[0:v]fps=${preset.fps},scale=${width}:${height}:flags=lanczos,setsar=1,split[a][b];` +
        `[a]palettegen=max_colors=${preset.colors}:stats_mode=${palette === "frame" ? "single" : "full"}:reserve_transparent=1[p];` +
        `[b][p]paletteuse=dither=${preset.dither}:diff_mode=${palette === "frame" ? "none" : "rectangle"}:new=${palette === "frame" ? 1 : 0}[out]`;
      await runProcess(process.env.FFMPEG_PATH ?? "ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-filter_complex_threads", "1",
        "-protocol_whitelist", "file,pipe", "-i", input, "-t", String(duration), "-filter_complex", filter,
        "-map", "[out]", "-an", "-map_metadata", "-1", "-loop", "0", "-gifflags", palette === "frame" ? "0" : "+offsetting+transdiff",
        "-global_palette", palette === "frame" ? "0" : "1", output,
      ], signal);
      if ((await stat(output)).size <= maxBytes) {
        const data = await readFile(output);
        if (data.subarray(0, 6).toString() !== "GIF89a" || data.at(-1) !== 0x3b) throw new GifError("The GIF failed integrity checks.");
        return { data, width, height, fps: preset.fps, colors: preset.colors, attempts: index + 1, duration, palette };
      }
    }
    throw new GifError("The GIF is still too large at the minimum quality setting. Record a shorter clip or reduce motion.");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
