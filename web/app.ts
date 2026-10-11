const scene = document.querySelector<HTMLSelectElement>("#scene")!;
const theme = document.querySelector<HTMLSelectElement>("#theme")!;
const frame = document.querySelector<HTMLIFrameElement>("#preview")!;
const preview = document.querySelector<HTMLElement>(".preview")!;
const open = document.querySelector<HTMLAnchorElement>("#open")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
let resize: ResizeObserver | undefined;

function load() {
  resize?.disconnect();
  const path = `examples/${scene.value}/${scene.value}${theme.value === "light" ? "-light" : ""}.html`;
  open.href = path;
  frame.title = `${scene.selectedOptions[0].textContent} — interactive scene`;
  preview.setAttribute("aria-busy", "true");
  status.textContent = "Loading scene…";
  frame.style.height = "500px";
  frame.src = path;
}

frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  preview.setAttribute("aria-busy", "false");
  if (!doc?.querySelector(".iso-plate")) {
    status.textContent = "The scene could not be loaded. Rebuild the project and try again.";
    return;
  }
  // Measure the content rather than the viewport so shorter scenes can shrink.
  const content = doc.querySelector<HTMLElement>("main") ?? doc.body;
  const size = () => {
    const bodyStyle = frame.contentWindow!.getComputedStyle(doc.body);
    const contentStyle = frame.contentWindow!.getComputedStyle(content);
    const height = content.getBoundingClientRect().bottom
      + Number.parseFloat(contentStyle.marginBottom || "0")
      + Number.parseFloat(bodyStyle.paddingBottom || "0");
    frame.style.height = `${Math.max(500, Math.ceil(height))}px`;
  };
  size();
  resize = new ResizeObserver(size);
  resize.observe(content);
  status.textContent = "";
});
scene.addEventListener("change", load);
theme.addEventListener("change", load);
window.addEventListener("pagehide", () => resize?.disconnect());
load();
