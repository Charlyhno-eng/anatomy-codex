import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromePath, chromePort } from "../scripts/chrome.js";
import { createPreviewServer } from "../scripts/preview-server.js";

const binary = chromePath();
assert.ok(binary, "Install Chrome or set CHROME_PATH to run browser tests.");
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
    "--autoplay-policy=no-user-gesture-required", "--window-size=1440,1200", "about:blank"]);
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
  await send("Page.navigate", { url: `http://127.0.0.1:${address.port}` });
  const loaded = 'document.querySelector(".preview")?.getAttribute("aria-busy") === "false" && document.querySelector("#preview").contentDocument?.querySelector(".iso-plate")';
  await waitFor(loaded);
  assert.equal(await evaluate('document.querySelector("#theme").value'), "dark");
  assert.equal(await evaluate('document.querySelector("#preview").contentDocument.body.dataset.theme'), "dark");
  assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), "dark");
  assert.equal(await evaluate('document.querySelector("#export")'), null);
  for (const name of ["dial-indicator", "desk-computer", "arcade-cabinet", "ripple-tank", "raptor-engine", "turning-dial", "test-rig", "spot-plate"]) {
    for (const theme of ["dark", "light"]) {
      await evaluate(`document.querySelector('#scene').value=${JSON.stringify(name)};document.querySelector('#theme').value=${JSON.stringify(theme)};document.querySelector('#scene').dispatchEvent(new Event('change'))`);
      await waitFor(loaded);
      assert.equal(await evaluate('document.querySelector("#preview").contentDocument.body.dataset.theme'), theme);
      assert.equal(await evaluate('document.querySelector("#open").href === document.querySelector("#preview").src'), true);
      assert.equal(await evaluate('document.querySelector("#status").textContent'), "");
      assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), "dark");
      assert.equal(await evaluate(`(()=>{const f=document.querySelector('#preview');const d=f.contentDocument;return d.documentElement.scrollHeight <= f.clientHeight + 2})()`), true, `${name} ${theme}: scene must not be clipped`);
      console.log(`${name} ${theme}: scene loaded.`);
    }
  }
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1200, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('#theme').value='dark';document.querySelector('#scene').dispatchEvent(new Event('change'))`);
    await waitFor(loaded);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, "The gallery must fit the viewport.");
    assert.equal(await evaluate(`(()=>{const f=document.querySelector('#preview');return f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 2})()`), true);
  }
  assert.deepEqual(errors, [], "All scenes must run without console errors or uncaught exceptions.");
  console.log("All 16 scene/theme views and responsive checks passed.");
} finally {
  socket?.close(); chrome?.kill("SIGKILL");
  if (chrome?.exitCode === null) await new Promise(done => { chrome.once("exit", done); setTimeout(done, 2000); });
  await new Promise<void>(done => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
