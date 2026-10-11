import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { assertCurrentTab, captureScene, recordingType, recordStream, regionVisible, type CaptureTrack } from "../web/capture.js";

const original = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
const originals = new Map(["navigator", "location", "CropTarget"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "MediaRecorder", original);
  else Reflect.deleteProperty(globalThis, "MediaRecorder");
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

class FakeRecorder extends EventTarget {
  static isTypeSupported() { return true; }
  static instances: FakeRecorder[] = [];
  static fail = false;
  state = "inactive";
  constructor() { super(); FakeRecorder.instances.push(this); }
  start() {
    if (FakeRecorder.fail) throw new Error("start failed");
    this.state = "recording";
  }
  data(blob = new Blob(["recorded frame"])) {
    const event = new Event("dataavailable") as Event & { data: Blob };
    event.data = blob; this.dispatchEvent(event);
  }
  stop() {
    this.state = "inactive";
    this.data(); this.dispatchEvent(new Event("stop"));
  }
}
function setup() {
  FakeRecorder.fail = false;
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: FakeRecorder });
  const track = new EventTarget();
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream, controller: new AbortController() };
}

test("selects a supported WebM codec in quality order", () => {
  assert.equal(recordingType({ isTypeSupported: type => type.includes("vp9") }), "video/webm;codecs=vp9");
  assert.equal(recordingType({ isTypeSupported: type => type.includes("vp8") }), "video/webm;codecs=vp8");
  assert.equal(recordingType({ isTypeSupported: () => false }), undefined);
});
test("a figure must be fully visible and have nonzero dimensions", () => {
  const region = { left: 20, right: 720, top: 20, bottom: 420, width: 700, height: 400 };
  const frame = { left: 100, top: 100 };
  assert.equal(regionVisible(region, frame, { width: 1440, height: 900 }), true);
  assert.equal(regionVisible(region, frame, { width: 800, height: 900 }), false);
  assert.equal(regionVisible(region, { left: 100, top: -21 }, { width: 1440, height: 900 }), false);
  assert.equal(regionVisible(region, { left: 100, top: 800 }, { width: 1440, height: 900 }), false);
  assert.equal(regionVisible({ ...region, width: 0 }, frame, { width: 1440, height: 900 }), false);
});
function captureSetup() {
  const { controller } = setup();
  const track = Object.assign(new EventTarget(), {
    stopped: 0, contentHint: "", stop() { this.stopped++; },
    getSettings: () => ({ displaySurface: "browser" }),
    getCaptureHandle: () => ({ handle: "mine", origin: "http://localhost:5173" }),
    cropTo: async (_target: unknown) => {},
  });
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  const devices = { getDisplayMedia: async () => stream };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: devices } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "http://localhost:5173" } });
  Object.defineProperty(globalThis, "CropTarget", { configurable: true, value: { fromElement: async () => "region" } });
  return { controller, track, devices };
}
test("scene capture records the chosen region and stops sharing after success", async () => {
  const { controller, track } = captureSetup();
  let cropped: unknown;
  track.cropTo = async target => { cropped = target; };
  const result = await captureScene({} as Element, 2, "mine", controller.signal, () => {});
  assert.equal(result.type, "video/webm"); assert.equal(cropped, "region");
  assert.equal(track.stopped, 1); assert.equal(track.contentHint, "detail");
});
test("wrong-tab selection and crop failure both stop all capture tracks", async () => {
  const wrong = captureSetup();
  wrong.track.getCaptureHandle = () => ({ handle: "other", origin: "http://localhost:5173" });
  await assert.rejects(captureScene({} as Element, 2, "mine", wrong.controller.signal, () => {}), /Select this Anatomy tab/);
  assert.equal(wrong.track.stopped, 1);
  const failed = captureSetup(); failed.track.cropTo = async () => { throw new Error("crop failed"); };
  await assert.rejects(captureScene({} as Element, 2, "mine", failed.controller.signal, () => {}), /crop failed/);
  assert.equal(failed.track.stopped, 1);
});
test("permission refusal, invalid duration and unavailable capture are reported", async () => {
  const { controller, devices } = captureSetup();
  devices.getDisplayMedia = async () => { throw new DOMException("Permission declined", "NotAllowedError"); };
  await assert.rejects(captureScene({} as Element, 2, "mine", controller.signal, () => {}), /Permission declined/);
  for (const duration of [0, 1, 9, Infinity, 2.5]) await assert.rejects(captureScene({} as Element, duration, "mine", controller.signal, () => {}), /duration/);
  Reflect.deleteProperty(globalThis, "CropTarget");
  await assert.rejects(captureScene({} as Element, 2, "mine", controller.signal, () => {}), /desktop Chrome or Edge/);
});
test("cancelling while the sharing dialog is open stops the eventual stream", async () => {
  const { controller, track, devices } = captureSetup();
  let release: () => void;
  const delay = new Promise<void>(done => { release = done; });
  const originalGet = devices.getDisplayMedia;
  devices.getDisplayMedia = async () => { await delay; return originalGet(); };
  const task = captureScene({} as Element, 2, "mine", controller.signal, () => {});
  controller.abort(new Error("cancelled at prompt")); release();
  await assert.rejects(task, /cancelled at prompt/); assert.equal(track.stopped, 1);
});
test("accepts only the current tab, with a matching capture handle and origin", () => {
  const track = (displaySurface: string, handle: string, origin: string) => ({ getSettings: () => ({ displaySurface }), getCaptureHandle: () => ({ handle, origin }) }) as unknown as CaptureTrack;
  assert.doesNotThrow(() => assertCurrentTab(track("browser", "mine", "http://localhost:5173"), "mine", "http://localhost:5173"));
  for (const candidate of [track("monitor", "mine", "http://localhost:5173"), track("browser", "other", "http://localhost:5173"), track("browser", "mine", "https://other.example")]) {
    assert.throws(() => assertCurrentTab(candidate, "mine", "http://localhost:5173"), /Select this Anatomy tab/);
  }
});
test("records a WebM blob and waits for the final recorder data", async () => {
  const { stream, controller } = setup();
  const result = await recordStream(stream, .01, "video/webm", controller.signal, () => {});
  assert.equal(result.type, "video/webm"); assert.equal(await result.text(), "recorded frame");
  assert.equal(FakeRecorder.instances.at(-1).state, "inactive");
});
test("cancels an active recording without returning a partial blob", async () => {
  const { stream, controller } = setup();
  const task = recordStream(stream, 10, "video/webm", controller.signal, () => {});
  controller.abort(); await assert.rejects(task, /cancelled/);
  assert.equal(FakeRecorder.instances.at(-1).state, "inactive");
});
test("rejects when sharing ends prematurely", async () => {
  const { stream, track, controller } = setup();
  const task = recordStream(stream, 10, "video/webm", controller.signal, () => {});
  track.dispatchEvent(new Event("ended")); await assert.rejects(task, /sharing stopped/);
});
test("recorder start and runtime failures are reported", async () => {
  const { stream, controller } = setup(); FakeRecorder.fail = true;
  await assert.rejects(recordStream(stream, 1, "video/webm", controller.signal, () => {}), /start failed/);
  FakeRecorder.fail = false;
  const task = recordStream(stream, 10, "video/webm", controller.signal, () => {});
  FakeRecorder.instances.at(-1).dispatchEvent(new Event("error")); await assert.rejects(task, /could not record/);
});
test("stops recording if upload size would exceed the limit", async () => {
  const { stream, controller } = setup();
  const task = recordStream(stream, 10, "video/webm", controller.signal, () => {});
  FakeRecorder.instances.at(-1).data(new Blob([new Uint8Array(32 * 1024 * 1024 + 1)]));
  await assert.rejects(task, /too large/);
});
