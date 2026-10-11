declare const __DATA__: { P: import("../../kit/iso-kit.js").Projection; BLOCKS: number[]; DIAL: [number, number]; DIAL_R: number; DIAL_TOP: number; PER_TURN: number; STEP: number; BLOCK_W: number; TIP_R: number; BASE: number; REACH: number[]; stops: number[]; startX: number };
declare const __NEEDLE__: (value: number) => string;
declare const translateAlong: typeof import("../../kit/iso-kit.js").translateAlong;
declare const lineOnTop: typeof import("../../kit/iso-kit.js").lineOnTop;
const D = __DATA__;
const { P, BLOCKS, DIAL, DIAL_R, DIAL_TOP, PER_TURN, STEP, BLOCK_W, TIP_R, BASE, REACH } = D;
const stage = document.querySelector<HTMLElement>(".iso-stage");
const svg = stage.querySelector<SVGElement>("svg");
const carriage = svg.querySelector<SVGElement>('[data-part="carriage"]');
const plunger = svg.querySelector<SVGElement>('[data-part="plunger"]');
const needle = svg.querySelector<SVGElement>('[data-part="needle"]');
const readout = document.querySelector<SVGElement>("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stops = D.stops;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const heightUnder = (cx) => {
  let top = BASE;
  BLOCKS.forEach((height, index) => {
    const from = cx - 24 + STEP * index, to = from + BLOCK_W;
    if (to > DIAL[0] - TIP_R && from < DIAL[0] + TIP_R) top = Math.max(top, BASE + height);
  });
  return top;
};
const blockUnder = (cx) => BLOCKS.findIndex((_, index) => { const from = cx - 24 + STEP * index; return DIAL[0] >= from && DIAL[0] <= from + BLOCK_W; });
const needleAt = __NEEDLE__;
let x = D.startX, target = x, tip = { at: BASE + BLOCKS[0], rate: 0 };
let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;
const tourAt = (t) => stops[Math.floor(t / 2.2) % stops.length];
function draw() {
  carriage.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  plunger.setAttribute("transform", translateAlong(P, [0, 0, tip.at]));
  needle.setAttribute("d", needleAt((tip.at - BASE) / PER_TURN));
  const index = blockUnder(x);
  const text = (index < 0 ? "between blocks" : "block " + (index + 1)) + " · reads " + (tip.at - BASE).toFixed(1) + " px";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(tip.at - BASE)));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = tourAt(clock); }
  x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.28));
  if (Math.abs(target - x) < 0.01) x = target;
  const want = heightUnder(x);
  const stiff = 420, drag = calm ? 2 * Math.sqrt(420) : 26;
  for (let i = 0; i < 4; i++) { tip.rate += ((want - tip.at) * stiff - tip.rate * drag) * dt / 4; tip.at += tip.rate * dt / 4; }
  if (Math.abs(want - tip.at) < 0.005 && Math.abs(tip.rate) < 0.005) { tip.at = want; tip.rate = 0; }
  draw();
  const settled = !touring && x === target && tip.rate === 0 && tip.at === want;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { touring = false; target = clamp(next, REACH[0], REACH[1]); clearTimeout(idleTimer); idleTimer = window.setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 3600); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.25) / 0.5, 0, 1);
  steer(REACH[0] + share * (REACH[1] - REACH[0]));
});
stage.addEventListener("pointerleave", () => steer(target));
stage.addEventListener("keydown", (event) => {
  const here = stops.reduce((best, stop, index) => (Math.abs(stop - target) < Math.abs(stops[best] - target) ? index : best), 0);
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = Math.max(0, here - 1);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = Math.min(stops.length - 1, here + 1);
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = stops.length - 1;
  if (to === null) return;
  event.preventDefault();
  steer(stops[to]);
});
draw();
