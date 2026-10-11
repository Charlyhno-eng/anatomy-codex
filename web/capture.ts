export interface CaptureTrack extends MediaStreamTrack {
  cropTo(target: unknown): Promise<void>;
  getCaptureHandle(): { handle?: string; origin?: string } | null;
}
export interface CaptureDevices extends MediaDevices {
  setCaptureHandleConfig(config: { handle: string; exposeOrigin: boolean; permittedOrigins: string[] }): void;
}
export interface RegionCapture {
  fromElement(element: Element): Promise<unknown>;
}

export function regionVisible(region: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">, frame: Pick<DOMRect, "left" | "top">, viewport: { width: number; height: number }): boolean {
  return region.width > 0 && region.height > 0 && frame.top + region.top >= 0 && frame.top + region.bottom <= viewport.height &&
    frame.left + region.left >= 0 && frame.left + region.right <= viewport.width;
}

export function recordingType(recorder: Pick<typeof MediaRecorder, "isTypeSupported">): string | undefined {
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => recorder.isTypeSupported(type));
}

export function assertCurrentTab(track: CaptureTrack, handle: string, origin: string): void {
  const captured = track.getCaptureHandle?.();
  if (track.getSettings().displaySurface !== "browser" || captured?.handle !== handle || captured.origin !== origin) {
    throw new Error("Select this Anatomy tab in the sharing dialog. Windows, screens and other tabs cannot be exported.");
  }
}

export function recordStream(stream: MediaStream, duration: number, type: string, signal: AbortSignal, onProgress: (seconds: number) => void): Promise<Blob> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;
    const track = stream.getVideoTracks()[0];
    const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
    const abort = () => { failure = new Error("Export cancelled."); stop(); };
    const ended = () => { failure = new Error("Tab sharing stopped before the recording finished."); stop(); };
    const cleanup = () => {
      clearTimeout(timer); clearInterval(interval);
      signal.removeEventListener("abort", abort);
      track.removeEventListener("ended", ended);
    };
    recorder.addEventListener("dataavailable", event => {
      bytes += event.data.size;
      if (bytes > 32 * 1024 * 1024) { failure = new Error("The recording is too large. Choose a shorter duration."); stop(); }
      else if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => { failure = new Error("The browser could not record this tab."); stop(); });
    recorder.addEventListener("stop", () => {
      cleanup();
      if (failure) reject(failure);
      else if (!finished || !chunks.length) reject(new Error("The recording ended without usable frames."));
      else resolve(new Blob(chunks, { type: "video/webm" }));
    }, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    track.addEventListener("ended", ended, { once: true });
    try { recorder.start(250); } catch (error) { cleanup(); reject(error); return; }
    const started = performance.now();
    interval = setInterval(() => onProgress(Math.min(duration, (performance.now() - started) / 1000)), 100);
    timer = setTimeout(() => { finished = true; stop(); }, duration * 1000);
  });
}

export async function captureScene(element: Element, duration: number, handle: string, signal: AbortSignal, progress: (seconds: number) => void): Promise<Blob> {
  const devices = navigator.mediaDevices as CaptureDevices;
  const crop = (globalThis as typeof globalThis & { CropTarget?: RegionCapture }).CropTarget;
  const type = typeof MediaRecorder === "undefined" ? undefined : recordingType(MediaRecorder);
  if (!devices?.getDisplayMedia || !crop?.fromElement || !type) throw new Error("GIF export requires desktop Chrome or Edge with tab capture support.");
  if (!Number.isInteger(duration) || duration < 2 || duration > 8) throw new Error("Choose a duration between 2 and 8 seconds.");
  let stream: MediaStream | undefined;
  try {
    stream = await devices.getDisplayMedia({
      video: { frameRate: { ideal: 20, max: 20 }, width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } },
      audio: false, preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", systemAudio: "exclude", monitorTypeSurfaces: "exclude",
    } as DisplayMediaStreamOptions);
    signal.throwIfAborted();
    const track = stream.getVideoTracks()[0] as CaptureTrack;
    assertCurrentTab(track, handle, location.origin);
    if (typeof track.cropTo !== "function") throw new Error("This browser does not support scene cropping. Use desktop Chrome or Edge.");
    await track.cropTo(await crop.fromElement(element));
    signal.throwIfAborted();
    track.contentHint = "detail";
    return await recordStream(stream, duration, type, signal, progress);
  } finally { stream?.getTracks().forEach(track => track.stop()); }
}
