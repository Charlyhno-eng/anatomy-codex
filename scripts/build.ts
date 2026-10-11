import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const output = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(output, "..");

async function copyAssets(folder: string): Promise<void> {
  for (const entry of await readdir(join(source, folder), { withFileTypes: true })) {
    const relative = join(folder, entry.name);
    if (entry.isDirectory()) await copyAssets(relative);
    else if (/\.(css|html)$/.test(entry.name)) {
      await mkdir(dirname(join(output, relative)), { recursive: true });
      await cp(join(source, relative), join(output, relative));
    }
  }
}

await copyAssets("kit");
await copyAssets("examples");

for (const name of ["test-rig", "spot-plate"]) {
  await build({
    entryPoints: [join(source, "examples", name, "preview.tsx")],
    outfile: join(output, "examples", name, "preview.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
  });
  for (const theme of ["dark", "light"]) {
    const suffix = theme === "light" ? "-light" : "";
    await writeFile(join(output, "examples", name, `${name}${suffix}.html`), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><link rel="stylesheet" href="../../kit/iso.css"><link rel="stylesheet" href="preview.css"><style>body{margin:0;padding:24px;font:13px/1.55 var(--anatomy-mono);background:var(--anatomy-page);color:var(--anatomy-text);color-scheme:dark}body[data-theme="light"]{color-scheme:light}main{max-width:760px;margin:auto}</style></head><body class="iso" data-theme="${theme}"><main id="root"></main><script src="preview.js"></script></body></html>`);
  }
}

await mkdir(join(output, "web"), { recursive: true });
await build({ entryPoints: [join(source, "web/app.ts")], outfile: join(output, "web/app.js"), bundle: true, platform: "browser", format: "iife", target: "es2022", minify: true });
await cp(join(source, "web/app.css"), join(output, "web/app.css"));
await cp(join(source, "web/index.html"), join(output, "index.html"));
console.log("TypeScript compiled and gallery ready in dist/. Run npm run preview.");
