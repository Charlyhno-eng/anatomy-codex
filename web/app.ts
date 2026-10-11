import { captureScene, regionVisible, type CaptureDevices } from "./capture.js";

const scene = document.querySelector<HTMLSelectElement>("#scene")!;
const theme = document.querySelector<HTMLSelectElement>("#theme")!;
const duration = document.querySelector<HTMLSelectElement>("#duration")!;
const frame = document.querySelector<HTMLIFrameElement>("#preview")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
const open = document.querySelector<HTMLAnchorElement>("#open")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const download = document.querySelector<HTMLAnchorElement>("#download")!;
const progress = document.querySelector<HTMLProgressElement>("#progress")!;
const handle = crypto.randomUUID();
let controller: AbortController | undefined;
let ready = false;
let available = false;
let downloadUrl: string | undefined;
let resize: ResizeObserver | undefined;

const devices = navigator.mediaDevices as CaptureDevices | undefined;
const supported = Boolean(devices?.getDisplayMedia && devices.setCaptureHandleConfig && "CropTarget" in window && typeof MediaRecorder !== "undefined");
if (supported) devices.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: [location.origin] });

function message(text: string) { status.textContent = text; }
function buttons() {
  scene.disabled = theme.disabled = duration.disabled = Boolean(controller);
  exportButton.disabled = !ready || !available || !supported || Boolean(controller);
  cancelButton.hidden = !controller;
}
function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
  download.hidden = true;
  download.removeAttribute("href");
}
function load() {
  ready = false;
  resize?.disconnect();
  clearDownload();
  const path = `examples/${scene.value}/${scene.value}${theme.value === "light" ? "-light" : ""}.html`;
  open.href = path;
  frame.src = path;
  message("Loading scene…");
  buttons();
}
frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  if (!doc?.querySelector(".iso-plate")) { message("The scene could not be loaded. Rebuild the project and try again."); return; }
  const size = () => { frame.style.height = `${Math.ceil(doc.documentElement.scrollHeight)}px`; };
  frame.style.height = "500px";
  size();
  resize = new ResizeObserver(size);
  resize.observe(doc.body);
  ready = true;
  if (!supported) message("View and interact with scenes here. GIF export requires desktop Chrome or Edge.");
  else if (available) message("Ready. Export records your current scene and interactions.");
  buttons();
});
scene.addEventListener("change", load);
theme.addEventListener("change", load);
cancelButton.addEventListener("click", () => controller?.abort());
const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && controller) controller.abort(); };
window.addEventListener("keydown", escape);
frame.addEventListener("load", () => frame.contentWindow?.addEventListener("keydown", escape));
window.addEventListener("pagehide", () => { controller?.abort(); resize?.disconnect(); clearDownload(); });

exportButton.addEventListener("click", async () => {
  if (controller || !ready) return;
  controller = new AbortController();
  const signal = controller.signal;
  clearDownload(); buttons();
  const name = scene.value;
  const chosenTheme = theme.value;
  const seconds = Number(duration.value);
  progress.value = 0; progress.max = seconds; progress.hidden = false;
  try {
    const plate = frame.contentDocument!.querySelector<HTMLElement>(".iso-plate")!;
    plate.scrollIntoView({ block: "center", behavior: "instant" });
    const rect = plate.getBoundingClientRect();
    const parent = frame.getBoundingClientRect();
    if (!regionVisible(rect, parent, { width: innerWidth, height: innerHeight })) {
      throw new Error("The whole scene must be visible. Zoom out in your browser, then export again.");
    }
    message("Choose this Anatomy tab in the sharing dialog.");
    const video = await captureScene(plate, seconds, handle, signal, elapsed => {
      const current = plate.getBoundingClientRect();
      if (!plate.isConnected || !regionVisible(current, frame.getBoundingClientRect(), { width: innerWidth, height: innerHeight })) {
        controller?.abort(new Error("Keep the whole scene visible while recording. Export again when it is in view.")); return;
      }
      if (Math.abs(current.width - rect.width) > 2 || Math.abs(current.height - rect.height) > 2) {
        controller?.abort(new Error("The scene size changed during recording. Export again without resizing or zooming.")); return;
      }
      progress.value = elapsed;
      message(`Recording ${elapsed.toFixed(1)} / ${seconds} seconds. You can interact with the scene.`);
    });
    progress.removeAttribute("value");
    message("Optimizing GIF quality and file size…");
    const response = await fetch("/api/gif", { method: "POST", body: video, headers: { "Content-Type": "video/webm" }, signal });
    if (!response.ok) throw new Error((await response.json()).error ?? "GIF export failed.");
    const gif = await response.blob();
    signal.throwIfAborted();
    if (gif.type !== "image/gif" || gif.size > 3 * 1024 * 1024 || gif.size === 0) throw new Error("The export did not meet the GIF size limit.");
    downloadUrl = URL.createObjectURL(gif);
    download.href = downloadUrl;
    download.download = `${name}-${chosenTheme}.gif`;
    download.hidden = false;
    download.click();
    message(`GIF ready · ${(gif.size / 1024).toFixed(0)} KiB · ${response.headers.get("X-Gif-Width")} × ${response.headers.get("X-Gif-Height")} · ${response.headers.get("X-Gif-Fps")} fps. Download again below.`);
  } catch (error) {
    if (signal.aborted) message(signal.reason instanceof Error && signal.reason.name !== "AbortError" ? signal.reason.message : "Export cancelled.");
    else if (error instanceof DOMException && error.name === "NotAllowedError") message("Tab sharing was declined. Click Export GIF to try again.");
    else message(error instanceof Error ? error.message : "GIF export failed. Try again.");
  } finally { controller = undefined; progress.hidden = true; buttons(); }
});

load();
fetch("/api/gif/status").then(async response => {
  if (!response.ok) throw new Error("The export service is unavailable.");
  available = Boolean((await response.json()).available);
  if (!available) message("Install FFmpeg (including ffprobe) and restart the interface to enable GIF export.");
  else if (ready && supported) message("Ready. Export records your current scene and interactions.");
  buttons();
}).catch(() => message("The export service is unavailable. Start this page with npm run dev."));
