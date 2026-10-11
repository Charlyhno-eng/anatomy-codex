import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { encodeGif, ffmpegAvailable, MAX_UPLOAD_BYTES, runProcess, type GifResult } from "../scripts/gif.js";

let directory: string;
let video: Buffer;
before(async () => {
  assert.equal(await ffmpegAvailable(), true, "FFmpeg and ffprobe must be installed to test GIF output.");
  directory = await mkdtemp(join(tmpdir(), "anatomy-test-"));
  await runProcess("ffmpeg", ["-v", "error", "-y", "-threads", "1", "-filter_threads", "1", "-loop", "1", "-i",
    resolve(".github/assets/raptor-engine-firing.webp"), "-vf", "scale=800:500,crop=720:440:x='40+30*sin(t*3)':y=30,format=yuv420p",
    "-t", "2", "-r", "20", "-c:v", "libvpx-vp9", "-lossless", "1", "-threads", "1", join(directory, "source.webm")]);
  video = await readFile(join(directory, "source.webm"));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

async function similarity(result: GifResult, source: string, file: string): Promise<number> {
  await writeFile(file, result.data);
  const stats = file + ".ssim.txt";
  await runProcess("ffmpeg", ["-v", "error", "-threads", "1", "-filter_complex_threads", "1", "-i", source, "-i", file,
    "-filter_complex", `[0:v]fps=${result.fps},scale=${result.width}:${result.height}:flags=lanczos,format=rgb24,settb=1/${result.fps},setpts=N[a];[1:v]format=rgb24,settb=1/${result.fps},setpts=N[b];[a][b]ssim=stats_file=${stats}`, "-f", "null", "-"]);
  const values = [...(await readFile(stats, "utf8")).matchAll(/All:([\d.]+)/g)].map(match => Number(match[1]));
  assert.ok(values.length > 0, "The quality comparison must contain actual frame measurements.");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

test("exports a complete, looping, animated GIF within the default budget", async () => {
  const result = await encodeGif(video);
  assert.ok(result.data.length < 3 * 1024 * 1024);
  assert.equal(result.width, 720); assert.equal(result.height, 440);
  assert.equal(result.palette, "global");
  assert.ok(result.fps >= 15); assert.ok(result.attempts >= 1);
  assert.ok(result.data.includes(Buffer.from("NETSCAPE2.0")));
  const loop = result.data.indexOf(Buffer.from("NETSCAPE2.0"));
  assert.deepEqual([...result.data.subarray(loop + 11, loop + 16)], [3, 1, 0, 0, 0]);
  const file = join(directory, "quality.gif");
  await writeFile(file, result.data);
  const metadata = JSON.parse(await runProcess("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames:format=duration", "-of", "json", file]));
  assert.equal(metadata.streams[0].width, 720);
  assert.equal(metadata.streams[0].height, 440);
  assert.equal(Number(metadata.streams[0].nb_read_frames), 2 * result.fps);
  assert.ok(Math.abs(Number(metadata.format.duration) - 2) < .11);
  await runProcess("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
  const quality = await similarity(result, join(directory, "source.webm"), file);
  assert.ok(quality >= .95, `Mean structural similarity ${quality} is below 0.95.`);
  console.log(`Reference clip: ${result.data.length} bytes, ${metadata.streams[0].nb_read_frames} frames, SSIM ${quality.toFixed(4)}.`);
});

test("re-encodes until a smaller size ceiling is met", async () => {
  const original = await encodeGif(video);
  const limit = Math.floor(original.data.length * .7);
  const smaller = await encodeGif(video, { maxBytes: limit });
  assert.ok(smaller.attempts > 1);
  assert.ok(smaller.data.length <= limit);
  assert.ok(smaller.width >= 480); assert.ok(smaller.fps >= 12);
  const quality = await similarity(smaller, join(directory, "source.webm"), join(directory, "smaller.gif"));
  assert.ok(quality >= .95, `Optimized structural similarity ${quality} is below 0.95.`);
  console.log(`Optimized clip: ${original.data.length} → ${smaller.data.length} bytes in ${smaller.attempts} attempts.`);
});
test("preserves gradients and full-frame color changes within the size ceiling", async () => {
  const source = join(directory, "gradients.webm");
  await runProcess("ffmpeg", ["-v", "error", "-y", "-threads", "1", "-filter_threads", "1", "-f", "lavfi", "-i",
    "nullsrc=s=640x360:r=20:d=2,geq=r='255*X/W':g='255*Y/H':b='128+127*sin(2*PI*T)',drawbox=x=0:y=0:w=64:h=64:color=white:t=fill,drawbox=x=576:y=0:w=64:h=64:color=black:t=fill", "-pix_fmt", "yuv420p",
    "-c:v", "libvpx-vp9", "-lossless", "1", "-threads", "1", source]);
  const result = await encodeGif(await readFile(source));
  const file = join(directory, "gradients.gif"); await writeFile(file, result.data);
  const stats = join(directory, "gradients.psnr.txt");
  await runProcess("ffmpeg", ["-v", "error", "-threads", "1", "-filter_complex_threads", "1", "-i", source, "-i", file,
    "-filter_complex", `[0:v]fps=${result.fps},scale=${result.width}:${result.height}:flags=lanczos,format=rgb24,settb=1/${result.fps},setpts=N[a];[1:v]format=rgb24,settb=1/${result.fps},setpts=N[b];[a][b]psnr=stats_file=${stats}`, "-f", "null", "-"]);
  const values = [...(await readFile(stats, "utf8")).matchAll(/psnr_avg:([\d.]+)/g)].map(match => Number(match[1]));
  const quality = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(result.data.length <= 3 * 1024 * 1024);
  assert.equal(result.palette, "frame", "Large color shifts need palettes that follow each frame.");
  assert.ok(quality >= 30, `Gradient color fidelity ${quality} dB is below 30 dB.`);
  for (const [x, expected] of [[10, 255], [result.width - 10, 0]]) {
    const pixels = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `crop=1:1:${x}:10,format=rgb24`, "-f", "rawvideo", "-"], { maxBuffer: 1024 * 1024 });
    assert.equal(pixels.status, 0, pixels.stderr.toString());
    assert.ok(pixels.stdout.length >= 60);
    assert.ok([...pixels.stdout].every(value => Math.abs(value - expected) <= 10), "Unchanged pixels must retain their colors when the palette changes.");
  }
  console.log(`Animated gradients: ${result.data.length} bytes, PSNR ${quality.toFixed(2)} dB, adaptive frame palettes.`);
});
test("refuses an impossible ceiling and cleans temporary files", async () => {
  const existing = (await readdir(tmpdir())).filter(name => name.startsWith("anatomy-gif-"));
  await assert.rejects(encodeGif(video, { maxBytes: 1024 }), /still too large/);
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith("anatomy-gif-")), existing);
});
test("rejects empty, oversized, corrupt and invalid-limit inputs", async () => {
  await assert.rejects(encodeGif(Buffer.alloc(0)), /empty/);
  await assert.rejects(encodeGif(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), /exceeds/);
  await assert.rejects(encodeGif(Buffer.from("not a video")), /could not be processed/);
  for (const maxBytes of [0, -1, NaN, Infinity, 3.5, 4 * 1024 * 1024]) await assert.rejects(encodeGif(video, { maxBytes }), /Invalid GIF size/);
});
test("cancellation stops encoding and removes temporary files", async () => {
  const controller = new AbortController();
  const existing = (await readdir(tmpdir())).filter(name => name.startsWith("anatomy-gif-"));
  const task = encodeGif(video, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("cancel test")), 40);
  await assert.rejects(task, /cancel test/);
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith("anatomy-gif-")), existing);
});
test("missing binaries, process timeout and pre-aborted work report errors", async () => {
  await assert.rejects(runProcess("/nonexistent/anatomy-ffmpeg", []), /Install FFmpeg/);
  await assert.rejects(runProcess(process.execPath, ["-e", "setTimeout(()=>{},10000)"], undefined, 20), /timed out/);
  const controller = new AbortController(); controller.abort(new Error("already cancelled"));
  await assert.rejects(encodeGif(video, { signal: controller.signal }), /already cancelled/);
});
test("dark backgrounds and transparent frame differences decode without ghosting", async () => {
  const input = join(directory, "dark.webm");
  await runProcess("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x151515:s=480x320:r=20:d=2",
    "-vf", "drawbox=x=100:y=100:w=120:h=120:color=white:t=fill:enable='between(t,0.4,1.2)'", "-c:v", "libvpx-vp9", "-lossless", "1", "-threads", "1", input]);
  const result = await encodeGif(await readFile(input));
  const file = join(directory, "dark.gif"); await writeFile(file, result.data);
  const decoded = spawnSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", file, "-threads", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 24 * 1024 * 1024 });
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  const pixel = (frame: number, x: number, y: number) => decoded.stdout[(frame * 480 * 320 + y * 480 + x) * 3];
  assert.ok(pixel(0, 150, 150) < 30); assert.ok(pixel(15, 150, 150) > 245); assert.ok(pixel(35, 150, 150) < 30);
  assert.ok(result.data.length < 20 * 1024, `Static regions should compress well: ${result.data.length} bytes.`);
});
