import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPreviewHandler } from "../scripts/preview-server.js";

async function request(url: string, method = "GET", headers: Record<string, string> = {}, body = Buffer.alloc(0), root = resolve("dist")) {
  const input = Readable.from(body.length ? [body] : []) as IncomingMessage;
  input.url = url; input.method = method; input.headers = { host: "localhost:5173", ...headers };
  const output = Object.assign(new EventEmitter(), {
    status: 0, headers: {} as Record<string, string>, body: Buffer.alloc(0), destroyed: false, writableEnded: false,
    writeHead(code: number, fields = {}) { this.status = code; this.headers = fields; return this; },
    end(data?: string | Buffer) { this.body = Buffer.from(data ?? ""); this.writableEnded = true; return this; },
  });
  await createPreviewHandler(root)(input, output as unknown as ServerResponse);
  return output;
}
test("serves the English interface, its bundle and all sixteen example variants", async () => {
  const index = await request("/"); assert.equal(index.status, 200); assert.ok(index.body.includes(Buffer.from('lang="en"')));
  for (const path of ["/web/app.js", "/web/app.css", ...["dial-indicator", "desk-computer", "arcade-cabinet", "ripple-tank", "raptor-engine", "turning-dial", "test-rig", "spot-plate"].flatMap(name => [`/examples/${name}/${name}.html`, `/examples/${name}/${name}-light.html`])]) {
    assert.equal((await request(path)).status, 200, path);
  }
});
test("HEAD, missing files, invalid methods and malformed URLs are handled", async () => {
  assert.equal((await request("/", "HEAD")).body.length, 0);
  assert.equal((await request("/missing.html")).status, 404);
  assert.equal((await request("/", "PUT")).status, 405);
  assert.equal((await request("/%ZZ")).status, 400);
});
test("blocks cross-origin requests and invalid hosts", async () => {
  assert.equal((await request("/", "GET", { origin: "https://other.example" })).status, 403);
  assert.equal((await request("/", "GET", { host: "other.example" })).status, 403);
});
test("GIF export routes are unavailable", async () => {
  assert.equal((await request("/api/gif/status")).status, 404);
  assert.equal((await request("/api/gif", "POST", { origin: "http://localhost:5173" })).status, 405);
});
test("does not serve paths or symlinks outside the output directory", async () => {
  const folder = await mkdtemp(join(tmpdir(), "anatomy-server-test-"));
  try {
    await writeFile(join(folder, "private.txt"), "private");
    await symlink(folder, join(folder, "link"), process.platform === "win32" ? "junction" : "dir");
    assert.equal((await request("/%2e%2e%2fprivate.txt", "GET", {}, Buffer.alloc(0), join(folder, "link"))).status, 403);
    assert.equal((await request("/private.txt", "GET", {}, Buffer.alloc(0), join(folder, "link"))).status, 403);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
