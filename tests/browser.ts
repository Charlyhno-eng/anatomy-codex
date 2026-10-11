import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromePath, chromePort } from "../scripts/chrome.js";
import { createPreviewServer } from "../scripts/preview-server.js";
import { ffmpegAvailable, runProcess } from "../scripts/gif.js";

const binary = chromePath();
assert.ok(binary, "Install Chrome or set CHROME_PATH to run browser tests.");
assert.equal(await ffmpegAvailable(), true, "FFmpeg and ffprobe are required.");
const directory = await mkdtemp(join(tmpdir(), "anatomy-browser-test-"));
const server = createPreviewServer(resolve("dist"));
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;
const errors: string[] = [];
try {
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  chrome = spawn(binary, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${join(directory, "profile")}`,
    "--no-first-run", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required", "--allow-http-screen-capture", "--enable-usermedia-screen-capturing",
    "--auto-select-tab-capture-source-by-title=Anatomy for Codex", "--auto-accept-this-tab-capture", "--window-size=1440,1200", "about:blank"]);
  const port = await chromePort(chrome, join(directory, "profile"));
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, { resolve: (data: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let id = 0;
  socket.onmessage = event => {
    const data = JSON.parse(String(event.data));
    const call = pending.get(data.id);
    if (call) { clearTimeout(call.timer); pending.delete(data.id); if (data.error) call.reject(new Error(data.error.message)); else call.resolve(data.result); }
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
    if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") errors.push(data.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
  };
  await new Promise<void>((done, fail) => { socket.onopen = () => done(); socket.onerror = () => fail(new Error("CDP connection failed.")); });
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((done, fail) => {
    const call = ++id;
    pending.set(call, { resolve: done, reject: fail, timer: setTimeout(() => { pending.delete(call); fail(new Error(`${method} timed out.`)); }, 30000) });
    socket.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async (expression: string, gesture = false) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: gesture });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression: string, timeout = 20000) => {
    const started = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - started > timeout) throw new Error(`Timed out: ${await evaluate('document.querySelector("#status")?.textContent')}`);
      await new Promise(done => setTimeout(done, 100));
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: directory });
  await send("Page.navigate", { url: `http://127.0.0.1:${address.port}` });
  await waitFor('document.querySelector("#export") && !document.querySelector("#export").disabled');
  for (const name of ["dial-indicator", "desk-computer", "arcade-cabinet", "ripple-tank", "raptor-engine", "turning-dial", "test-rig", "spot-plate"]) {
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.querySelector('#scene').value=${JSON.stringify(name)};document.querySelector('#theme').value=${JSON.stringify(theme)};document.querySelector('#duration').value='2';document.querySelector('#scene').dispatchEvent(new Event('change'))`);
      await waitFor('!document.querySelector("#export").disabled');
      await evaluate(`(()=>{const p=document.querySelector('#preview').contentDocument.querySelector('.iso-plate');const marker=document.createElement('div');marker.id='capture-test-marker';marker.style.cssText='position:absolute;left:0;top:0;width:48px;height:48px;background:#ff0000;z-index:100';p.append(marker)})()`);
      await evaluate(`document.querySelector('#export').click()`, true);
      await waitFor(`document.querySelector('#status').textContent.startsWith('Recording')`);
      await new Promise(done => setTimeout(done, 600));
      await evaluate(`document.querySelector('#preview').contentDocument.querySelector('#capture-test-marker').style.background='#0000ff'`);
      await waitFor(`!document.querySelector('#download').hidden`, 90000);
      const bytes = await evaluate(`(async()=>Array.from(new Uint8Array(await (await fetch(document.querySelector('#download').href)).arrayBuffer())))()`);
      const gif = Buffer.from(bytes);
      assert.ok(gif.length > 1000 && gif.length <= 3 * 1024 * 1024, `${name} ${theme}: invalid GIF size`);
      const file = join(directory, `${name}-${theme}.gif`); await writeFile(file, gif);
      const info = JSON.parse(await runProcess("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=nb_read_frames,width,height:format=duration", "-of", "json", file]));
      assert.ok(Number(info.streams[0].nb_read_frames) >= 20, "Animated frames must be present.");
      assert.ok(Number(info.format.duration) >= 1.8 && Number(info.format.duration) <= 2.4, "Recorded timing must be preserved.");
      const pixels = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "crop=1:1:10:10,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1024 * 1024 });
      assert.equal(pixels.status, 0, pixels.stderr.toString());
      assert.ok(pixels.stdout[0] > 200 && pixels.stdout[2] < 50, "The first frame should show the red live marker.");
      assert.ok(pixels.stdout.at(-1) > 200 && pixels.stdout.at(-3) < 50, "The last frame should show the blue live marker.");
      console.log(`${name} ${theme}: ${gif.length} bytes, ${info.streams[0].nb_read_frames} frames, real tab capture passed.`);
      await waitFor('!document.querySelector("#export").disabled');
    }
  }
  await evaluate(`document.querySelector('#export').click()`, true);
  await waitFor(`document.querySelector('#status').textContent.startsWith('Recording')`);
  await evaluate(`document.querySelector('#cancel').click()`);
  await waitFor(`document.querySelector('#status').textContent==='Export cancelled.'`);
  assert.equal(await evaluate(`document.querySelector('#download').hidden`), true);
  assert.deepEqual(errors, [], "All scenes must run without console errors or uncaught exceptions.");
  console.log("All 16 scene/theme exports and cancellation passed.");
} finally {
  socket?.close(); chrome?.kill("SIGKILL");
  if (chrome?.exitCode === null) await new Promise(done => { chrome.once("exit", done); setTimeout(done, 2000); });
  await new Promise<void>(done => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
