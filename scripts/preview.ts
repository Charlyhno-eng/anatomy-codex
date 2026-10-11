import { createPreviewServer } from "./preview-server.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--port");
const port = Number(at < 0 ? process.env.PORT ?? 5173 : args[at + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
const server = createPreviewServer(root);
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Anatomy: http://localhost:${port}`));
