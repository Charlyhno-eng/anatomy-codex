import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { DEFAULT_GIF_BYTES, encodeGif, ffmpegAvailable, GifError, MAX_UPLOAD_BYTES } from "./gif.js";

export function createPreviewHandler(rootDirectory: string) {
  const root = resolve(rootDirectory);
  let busy = false;
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
      if (pathname === "/api/gif/status" && request.method === "GET") {
        json(200, { available: await ffmpegAvailable(), maxBytes: DEFAULT_GIF_BYTES }); return;
      }
      if (pathname === "/api/gif" && request.method === "POST") {
        if (request.headers.origin !== `http://${host}`) { json(403, { error: "An export must originate from this interface." }); return; }
        if (busy) { json(409, { error: "An export is already being encoded. Try again when it finishes." }); return; }
        if (!/^video\/webm(?:;|$)/i.test(request.headers["content-type"] ?? "")) { json(415, { error: "A WebM recording is required." }); return; }
        const length = Number(request.headers["content-length"] ?? 0);
        if (!Number.isFinite(length) || length < 0 || length > MAX_UPLOAD_BYTES) { json(413, { error: "The recording exceeds 32 MiB." }); return; }
        busy = true;
        const controller = new AbortController();
        const stopUpload = () => { if (!request.complete) request.destroy(controller.signal.reason); };
        controller.signal.addEventListener("abort", stopUpload, { once: true });
        const cancel = () => { if (!response.writableEnded) controller.abort(new Error("Export cancelled.")); };
        response.once("close", cancel);
        request.once("aborted", cancel);
        const deadline = setTimeout(() => controller.abort(new Error("The upload or export timed out.")), 120000);
        try {
          let size = 0;
          const chunks: Buffer[] = [];
          for await (const chunk of request) {
            size += chunk.length;
            if (size > MAX_UPLOAD_BYTES) throw new GifError("The recording exceeds 32 MiB.", 413);
            chunks.push(Buffer.from(chunk));
            controller.signal.throwIfAborted();
          }
          const result = await encodeGif(Buffer.concat(chunks), { signal: controller.signal });
          if (!response.destroyed) response.writeHead(200, {
            "Content-Type": "image/gif", "Content-Disposition": 'attachment; filename="anatomy.gif"',
            "Content-Length": result.data.length, "Cache-Control": "no-store",
            "X-Gif-Width": result.width, "X-Gif-Height": result.height, "X-Gif-Fps": result.fps,
            "X-Gif-Colors": result.colors, "X-Gif-Attempts": result.attempts,
            "X-Gif-Palette": result.palette,
          }).end(result.data);
        } finally {
          clearTimeout(deadline);
          response.off("close", cancel);
          request.off("aborted", cancel);
          controller.signal.removeEventListener("abort", stopUpload);
          busy = false;
        }
        return;
      }
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
      if (error instanceof GifError) json(error.status, { error: error.message });
      else if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") response.writeHead(404).end("Not found");
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
