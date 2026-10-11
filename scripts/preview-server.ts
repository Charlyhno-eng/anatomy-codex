import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export function createPreviewHandler(rootDirectory: string) {
  const root = resolve(rootDirectory);
  const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".json": "application/json" };
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = (status: number, body: unknown) => {
      if (!response.destroyed) response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
    };
    try {
      const host = request.headers.host ?? "";
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) { json(403, { error: "Use the localhost address." }); return; }
      if (request.headers.origin && request.headers.origin !== `http://${host}`) { json(403, { error: "Cross-origin requests are not allowed." }); return; }
      const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end(); return;
      }
      let file = resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end("Forbidden"); return; }
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      file = await realpath(file);
      if (!file.startsWith(root + sep)) { response.writeHead(403).end("Forbidden"); return; }
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") response.writeHead(404).end("Not found");
      else json(400, { error: error instanceof Error ? error.message : "The request failed." });
    }
  };
}

export function createPreviewServer(root: string) {
  const server = createServer(createPreviewHandler(root));
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  return server;
}
