declare const __DATA__: { P: import("../../kit/iso-kit.js").Projection; KEYS: string[]; PHRASES: string[]; CRT_MID: number; TEXT_X: number };
declare const axisVector: typeof import("../../kit/iso-kit.js").axisVector;
const { P, KEYS, PHRASES, CRT_MID, TEXT_X } = __DATA__;
const MAX_CHARS = 20;
const SHIFTED = { "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/" };
const stage = document.querySelector<HTMLElement>(".iso-stage");
const svg = stage.querySelector<SVGElement>("svg");
const keyEls = KEYS.map((_, i) => svg.querySelector<SVGElement>('[data-key="' + i + '"]'));
const textEl = svg.querySelector<SVGTextElement>('[data-part="text"]');
const cursor = svg.querySelector<SVGElement>('[data-part="cursor"]');
const crt = svg.querySelector<SVGElement>('[data-part="crt"]');
const beam = svg.querySelector<SVGElement>('[data-part="beam"]');
const dot = svg.querySelector<SVGElement>('[data-part="dot"]');
const glass = svg.querySelector<SVGElement>(".pc-glass");
const led = svg.querySelector<SVGElement>('[data-part="led"]');
const rockerOn = svg.querySelector<SVGElement>('[data-rocker="on"]');
const rockerOff = svg.querySelector<SVGElement>('[data-rocker="off"]');
const readout = document.querySelector<SVGElement>("[data-readout]");
const status = document.querySelector<SVGElement>("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const DOWN = 2.2;
const down = axisVector(P, [0, 0, -1]);

const keyState = KEYS.map(() => ({ at: 0, held: 0 }));
const active = new Set<number>();
let line = "", lastKey = "", power = 1, powerClock = 9, keysTyped = 0;
let frame = 0, previous = 0, visible = false, touring = !still.matches, idleTimer = 0;
let tour = { phrase: 0, step: "type", index: 0, wait: 1.4 };

const indexOf = (code) => KEYS.indexOf(code);
function press(code, hold = 0.09) {
  const i = indexOf(code);
  if (i < 0) return;
  keyState[i].held = hold;
  active.add(i);
  run();
}
function type(char) {
  if (!power) return;
  const lower = char.toLowerCase();
  const code = SHIFTED[char] || lower;
  if (indexOf(code) < 0) return;
  if (SHIFTED[char] || char !== lower) press("Shift", 0.14);
  press(code);
  keysTyped++;
  lastKey = char === " " ? "space" : char;
  if (line.length < MAX_CHARS) line += char;
  write();
}
function erase() { if (!power) return; press("Backspace"); lastKey = "backspace"; line = line.slice(0, -1); write(); }
function enter() { if (!power) return; press("Enter"); lastKey = "return"; line = ""; write(); }
function write() {
  textEl.textContent = "> " + line;
  cursor.setAttribute("x", String(TEXT_X + textEl.getComputedTextLength() + 0.4));
  const text = power ? "on · " + line.length + " chars" + (lastKey ? " · key " + lastKey : "") : "off";
  if (readout.textContent !== text) readout.textContent = text;
}
function setPower(next) {
  if (next === power) return;
  power = next;
  powerClock = still.matches ? 9 : 0;
  rockerOn.style.display = power ? "" : "none";
  rockerOff.style.display = power ? "none" : "";
  led.style.opacity = power ? "" : "0.15";
  status.textContent = power ? "Computer on." : "Computer off.";
  write();
  run();
}
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
function crtFrame() {
  const t = powerClock;
  let sx = 1, sy = 1, beamAt = 0, dotAt = 0, lit = power;
  if (power) {
    if (t < 0.14) { sx = ease(t / 0.14); sy = 0.012; beamAt = 1; }
    else if (t < 0.36) { sy = 0.012 + 0.988 * ease((t - 0.14) / 0.22); beamAt = 1 - ease((t - 0.14) / 0.22); }
  } else {
    if (t < 0.1) { sy = 1 - 0.988 * ease(t / 0.1); beamAt = ease(t / 0.1); lit = 1; }
    else if (t < 0.26) { sy = 0.012; sx = 1 - ease((t - 0.1) / 0.16); beamAt = 1; lit = 1; }
    else { sx = 0; sy = 0; dotAt = Math.max(0, 1 - (t - 0.26) / 0.5); }
  }
  crt.setAttribute("transform", "translate(0 " + -CRT_MID + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ") translate(0 " + CRT_MID + ")");
  beam.setAttribute("transform", "translate(0 " + -CRT_MID + ") scale(" + Math.max(sx, 0.001).toFixed(3) + " 1) translate(0 " + CRT_MID + ")");
  beam.style.opacity = beamAt.toFixed(2);
  dot.style.opacity = dotAt.toFixed(2);
  glass.toggleAttribute("data-on", !!lit);
  return t > 0.8;
}
function tourStep(dt) {
  tour.wait -= dt;
  if (tour.wait > 0) return;
  const phrase = PHRASES[tour.phrase];
  if (tour.step === "type") {
    if (tour.index < phrase.length) { type(phrase[tour.index++]); tour.wait = 0.09 + Math.random() * 0.11 + (phrase[tour.index - 1] === " " ? 0.08 : 0); }
    else { tour.step = "erase"; tour.wait = 2.4; }
  } else if (tour.step === "erase") {
    if (line.length) { erase(); tour.wait = 0.055; }
    else if (tour.phrase === PHRASES.length - 1) { tour.step = "off"; tour.wait = 0.9; }
    else { tour.phrase++; tour.index = 0; tour.step = "type"; tour.wait = 0.7; }
  } else if (tour.step === "off") { setPower(0); tour.step = "on"; tour.wait = 1.6; }
  else if (tour.step === "on") { setPower(1); tour = { phrase: 0, step: "type", index: 0, wait: 1.4 }; }
}
function tick(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
  previous = now;
  const calm = still.matches;
  if (touring) tourStep(dt);
  powerClock += dt;
  const settledCrt = crtFrame();
  for (const i of active) {
    const s = keyState[i];
    s.held = Math.max(0, s.held - dt);
    const want = s.held > 0 ? DOWN : 0;
    s.at = calm ? want : s.at + (want - s.at) * (1 - Math.exp(-dt / (want ? 0.025 : 0.07)));
    if (Math.abs(want - s.at) < 0.01) s.at = want;
    keyEls[i].setAttribute("transform", "translate(" + (down[0] * s.at).toFixed(2) + " " + (down[1] * s.at).toFixed(2) + ")");
    keyEls[i].toggleAttribute("data-down", s.at > 0.6);
    if (!s.held && s.at === 0) active.delete(i);
  }
  const busy = touring || active.size || !settledCrt;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { previous = 0; frame = requestAnimationFrame(tick); } }
function takeOver(switching = false) {
  if (touring) { touring = false; tour = { phrase: 0, step: "type", index: 0, wait: 1.4 }; line = ""; if (!switching) setPower(1); write(); }
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { if (still.matches) return; touring = true; line = ""; setPower(1); write(); run(); }, 9000);
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  if (key === "Tab") return;
  takeOver(key === "Escape");
  if (key === "Escape") { event.preventDefault(); setPower(power ? 0 : 1); return; }
  if (key === "Backspace") { event.preventDefault(); erase(); return; }
  if (key === "Enter") { event.preventDefault(); enter(); return; }
  if (key === "Shift") { press(event.code === "ShiftRight" ? "ShiftRight" : "Shift", 0.14); return; }
  if (key.length === 1) { event.preventDefault(); type(key); }
});
svg.addEventListener("click", (event) => {
  const key = (event.target as Element).closest<SVGElement>("[data-key]");
  if (key) {
    takeOver();
    const code = KEYS[Number(key.dataset.key)];
    if (code.length === 1) type(code);
    else if (code === "Backspace") erase();
    else if (code === "Enter" || code === "NumpadEnter") enter();
    else press(code);
    stage.focus({ preventScroll: true });
    return;
  }
  if ((event.target as Element).closest('[data-part="computer"]')) { takeOver(true); setPower(power ? 0 : 1); stage.focus({ preventScroll: true }); }
});
write();
crtFrame();
