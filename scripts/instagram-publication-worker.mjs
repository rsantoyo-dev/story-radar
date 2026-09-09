import nextEnv from "@next/env";
import { setTimeout as delay } from "node:timers/promises";

nextEnv.loadEnvConfig(process.cwd());
const secret = process.env.INSTAGRAM_PUBLISH_WORKER_SECRET?.trim();
const base = process.env.INSTAGRAM_PUBLISH_WORKER_URL?.trim() || process.env.RADAR_APP_URL?.trim();
if (!secret || !base) throw new Error("Configure INSTAGRAM_PUBLISH_WORKER_SECRET and INSTAGRAM_PUBLISH_WORKER_URL (or RADAR_APP_URL)");
const url = new URL("/api/internal/instagram-publications/resume", base);
if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
  throw new Error("Use HTTPS, or HTTP on loopback, for the publication worker");
}
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());
const once = process.argv.includes("--once");
do {
  try {
    const response = await fetch(url, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(125_000)]),
    });
    if (!response.ok) throw new Error("Worker request failed");
    const result = await response.json();
    console.log(`Instagram worker: ${Number(result.selected) || 0} orders selected`);
  } catch {
    if (!stop.signal.aborted) console.error("Instagram worker pass failed; check app availability and worker configuration.");
    if (once) process.exitCode = 1;
  }
  if (once || stop.signal.aborted) break;
  await delay(5_000, undefined, { signal: stop.signal }).catch(() => {});
} while (!stop.signal.aborted);
