import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");
export function browserScript(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^import .*$/gm, "")
    .replace(/^export /gm, "")
    .replace(/^\/\/# sourceMappingURL=.*$/gm, "") + "\n";
}

const strip = (file: string) => browserScript(join(KIT, file));

export function kitScript() {
  return strip("iso-kit.js");
}

export function glScript() {
  return strip("gl.js");
}

export function turnScript() {
  return strip("turn.js");
}

export function fixedScript() {
  return strip("turn-fixed.js") + "\n" + strip("canvas-painter.js");
}

export function glSharedScript() {
  return strip("gl-shared.js");
}
