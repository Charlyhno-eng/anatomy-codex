import { mkdir, lstat, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("npm run skill:install [-- --project /path/to/project | --destination /path/to/skills]");
  process.exit(0);
}
let directory = join(homedir(), ".agents", "skills");
if (args.length) {
  if (args.length !== 2 || !["--project", "--destination"].includes(args[0])) throw new Error("Use --project <directory> or --destination <skills-directory>.");
  directory = args[0] === "--project" ? join(resolve(args[1]), ".agents", "skills") : resolve(args[1]);
}
const target = join(directory, "anatomy");
await mkdir(directory, { recursive: true });
let exists = true;
try { await lstat(target); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  exists = false;
}
if (exists) {
  const installed = await realpath(target).catch(() => null);
  if (installed !== await realpath(root)) throw new Error(`${target} already exists. Move it before installing Anatomy.`);
  console.log(`Already installed: ${target}`);
} else {
  await symlink(root, target, process.platform === "win32" ? "junction" : "dir");
  console.log(`Installed: ${target} -> ${root}`);
}
console.log("Start a new Codex session and invoke $anatomy. Keep this checkout in place.");
