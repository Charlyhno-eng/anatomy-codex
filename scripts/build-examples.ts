import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["dial-indicator", "desk-computer", "arcade-cabinet", "ripple-tank", "turning-dial", "raptor-engine"];
const requested = process.argv.slice(2);
if (requested.some(name => !names.includes(name))) throw new Error(`Choose from: ${names.join(", ")}`);
for (const name of requested.length ? requested : names) {
  for (const flags of [[], ["--light"], ...(name === "turning-dial" ? [["--light", "--verify"]] : [])]) {
    const result = spawnSync(process.execPath, [join(root, "examples", name, "build.js"), ...flags], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (name === "turning-dial") {
    const result = spawnSync(process.execPath, [join(root, "examples", name, "stress.js"), "--light"], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
