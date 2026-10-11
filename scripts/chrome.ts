import { existsSync, readdirSync, rmSync } from "node:fs";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function chromePath(): string | undefined {
  const candidates: string[] = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter((path): path is string => Boolean(path));
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), ".cache", "ms-playwright"),
    join(homedir(), "Library", "Caches", "ms-playwright"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright"),
  ].filter((path): path is string => Boolean(path));
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    for (const directory of readdirSync(cache).sort().reverse()) {
      for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
        candidates.push(join(cache, directory, binary));
      }
    }
  }
  return candidates.find(path => existsSync(path));
}

export function chromePort(chrome: ChildProcessWithoutNullStreams, profile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const cleanup = () => {
      clearTimeout(timer);
      chrome.stderr.off("data", data);
      chrome.off("error", failed);
      chrome.off("exit", exited);
    };
    const failed = (error: Error) => {
      cleanup();
      chrome.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
      reject(new Error(`${error.message}${stderr ? `\n${stderr.trim()}` : ""}`));
    };
    const exited = (code: number | null, signal: string | null) => failed(new Error(`Chrome exited before CDP started (${signal ?? code}).`));
    const data = (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
      const match = stderr.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (match) { cleanup(); resolve(Number(match[1])); }
    };
    const timer = setTimeout(() => failed(new Error("Chrome did not start within 20 seconds.")), 20000);
    chrome.stderr.on("data", data);
    chrome.once("error", failed);
    chrome.once("exit", exited);
  });
}
