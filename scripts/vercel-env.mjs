import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cliVersion = "60.0.0";
export const managedKeys = new Set([
  "AI_CANDIDATE_MAX_AGE_HOURS", "AI_MAX_CONTENT_CHARS", "AI_MAX_RUNS_PER_DAY",
  "AI_MAX_STORIES_PER_DAY", "AI_MAX_STORIES_PER_RUN", "AI_MIN_LOCAL_SCORE",
  "CLOUDFLARE_AI_MODEL", "CREATIVE_ANTHROPIC_MODEL", "CREATIVE_CAROUSEL_WRITER_MODEL", "CREATIVE_CRITIC_MODEL",
  "CREATIVE_GEO_MAPTILER_EXPORT_ENABLED", "CREATIVE_GOOGLE_MAPS_MAX_PHOTOS",
  "CREATIVE_GOOGLE_MAPS_MAX_PREVIEWS_PER_DAY", "CREATIVE_GOOGLE_MAPS_PREVIEW_ENABLED",
  "CREATIVE_GROQ_MODEL", "CREATIVE_MAX_RUNS_PER_DAY", "CREATIVE_MINOR_REPAIR_MODEL",
  "CREATIVE_SEVERE_REPAIR_MODEL", "CREATIVE_SINGLE_SHOT_ENABLED",
  "CREATIVE_SINGLE_SHOT_REPAIR_MODEL", "CREATIVE_STORY_TEXT_BUDGET_USD",
  "CREATIVE_STRUCTURAL_REPAIR_MODEL", "CREATIVE_TEXT_PROVIDER", "FAL_IMAGE_MODEL",
  "GEMINI_MODEL",
]);

export function parseConfig(contents) {
  const values = {};
  for (const [index, raw] of contents.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) throw new Error(`Invalid .env.vercel assignment on line ${index + 1}.`);
    const [, key, input] = match;
    if (!managedKeys.has(key)) throw new Error(`Unmanaged variable: ${key}. Keep credentials and deployment URLs in Vercel.`);
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate variable: ${key}.`);
    const value = input.replace(/^(["'])(.*)\1$/u, "$2");
    let valid;
    if (key.endsWith("_MODEL")) valid = /^[a-zA-Z0-9@/._:-]+$/u.test(value);
    else if (key.endsWith("_ENABLED")) valid = value === "true" || value === "false";
    else if (key === "CREATIVE_TEXT_PROVIDER") valid = value === "gemini" || value === "groq";
    else valid = /^\d+(?:\.\d+)?$/u.test(value) && Number(value) > 0;
    if (key === "AI_MIN_LOCAL_SCORE") valid &&= Number(value) <= 100;
    if (!valid) throw new Error(`Invalid configuration for ${key}; values are omitted from errors.`);
    values[key] = value;
  }
  if (!Object.keys(values).length) throw new Error(".env.vercel has no managed configuration.");
  return values;
}

const targets = (entry) => Array.isArray(entry.target) ? entry.target : [entry.target].filter(Boolean);
const digest = (key, value) => createHash("sha256").update(JSON.stringify([key, value])).digest("hex");
export const metadata = (entry) => ({
  id: entry.id, type: entry.type, target: targets(entry),
  gitBranch: entry.gitBranch || null, updatedAt: entry.updatedAt ?? null,
  customEnvironmentIds: entry.customEnvironmentIds || [],
});

export function planSync(values, envs, receipt = {}) {
  return Object.entries(values).map(([key, value]) => {
    const matches = envs.filter((entry) => entry.key === key && targets(entry).includes("production") && !entry.gitBranch);
    if (matches.length > 1) throw new Error(`Multiple Production entries for ${key}; resolve them in Vercel first.`);
    const entry = matches[0];
    if (!entry) return { key, value, status: "missing" };
    if (targets(entry).length !== 1 || entry.customEnvironmentIds?.length) {
      throw new Error(`${key} is shared with another environment. Separate its Production entry in Vercel before syncing.`);
    }
    const saved = receipt.variables?.[key];
    const readable = typeof entry.value === "string" && entry.value !== "[SENSITIVE]" && (entry.type === "plain" || entry.decrypted === true);
    const matchesReceipt = saved?.digest === digest(key, value) && entry.updatedAt != null && JSON.stringify(saved.metadata) === JSON.stringify(metadata(entry));
    const status = readable ? (entry.value === value ? "paired" : "different") : (matchesReceipt ? "paired" : "unverified");
    return { key, value, entry, status };
  });
}

export function makeReceipt(link, values, envs) {
  const plan = planSync(values, envs);
  if (plan.some((item) => !item.entry)) throw new Error("Production verification failed: a managed variable is missing.");
  if (plan.some((item) => item.status === "different")) throw new Error("Production verification failed: a readable value differs from the configured value.");
  return {
    version: 1, projectId: link.projectId, orgId: link.orgId, syncedAt: new Date().toISOString(),
    variables: Object.fromEntries(plan.map(({ key, value, entry }) => [key, { digest: digest(key, value), metadata: metadata(entry) }])),
  };
}

function vercel(args, input, inherit = false) {
  // Values go through stdin. Capture API output because it may contain secrets.
  const override = process.env.VERCEL_ENV_CLI_PATH;
  const command = override ? process.execPath : (process.platform === "win32" ? "npx.cmd" : "npx");
  const prefix = override ? [override] : ["--yes", `vercel@${cliVersion}`];
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args, "--cwd", root, "--non-interactive"], {
      cwd: root, shell: false, stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    });
    let output = "";
    if (!inherit) {
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
    child.on("error", () => reject(new Error("Cannot start Vercel CLI. Check Node.js/npm and your Vercel login.")));
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`Vercel CLI failed (exit ${code}). Check your login and project access; provider output was hidden.`)));
  });
}

async function main() {
  const mode = process.argv[2] || "check";
  if (!["check", "sync", "deploy"].includes(mode)) throw new Error("Usage: node scripts/vercel-env.mjs [check|sync|deploy]");
  const configFile = path.join(root, ".env.vercel");
  const receiptFile = path.join(root, ".vercel/env-production-sync.json");
  const values = parseConfig(await readFile(configFile, "utf8").catch(() => { throw new Error("Create .env.vercel first: cp .env.vercel.example .env.vercel"); }));
  const link = JSON.parse(await readFile(path.join(root, ".vercel/project.json"), "utf8").catch(() => { throw new Error(`Link this project first: npx vercel@${cliVersion} link`); }));
  if (!link.projectId || !link.orgId) throw new Error("Invalid .vercel/project.json.");
  // Bootstrap npx once before concurrent requests to avoid concurrent installs.
  await vercel(["--version"]);
  const base = `/v9/projects/${encodeURIComponent(link.projectId)}`;
  const api = async (endpoint, method = "GET", body) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const args = ["api", `${endpoint}${separator}teamId=${encodeURIComponent(link.orgId)}`, "--method", method, "--raw"];
    if (body !== undefined) args.push("--input", "-");
    const output = await vercel(args, body === undefined ? undefined : JSON.stringify(body));
    try { return JSON.parse(output); } catch { throw new Error("Vercel returned an invalid API response; output was hidden."); }
  };
  const envEndpoint = `/v10/projects/${encodeURIComponent(link.projectId)}/env`;
  const [project, listing] = await Promise.all([api(base), api(envEndpoint)]);
  if (project.id !== link.projectId || project.accountId !== link.orgId || (link.projectName && project.name !== link.projectName)) throw new Error("Linked Vercel project identity mismatch.");
  if (!Array.isArray(listing.envs)) throw new Error("Invalid Vercel environment listing.");
  let receipt = {};
  try { receipt = JSON.parse(await readFile(receiptFile, "utf8")); } catch { /* First sync has no receipt. */ }
  if (receipt.version !== 1 || receipt.projectId !== link.projectId || receipt.orgId !== link.orgId) receipt = {};
  const plan = planSync(values, listing.envs, receipt);
  console.log(`Vercel ${project.name} · Production · .env.vercel`);
  for (const { key, status } of plan) console.log(`${status.padEnd(10)} ${key}`);
  if (mode === "check") {
    const pending = plan.filter((item) => item.status !== "paired");
    console.log(pending.length ? `${pending.length} variables need syncing or a verification receipt. Run npm run env:vercel:sync.` : "Managed configuration is paired with Vercel Production.");
    if (pending.length) process.exitCode = 1;
    return;
  }
  const changes = plan.filter((item) => item.status !== "paired");
  for (const { key, value, entry } of changes) {
    if (entry) await api(`${base}/env/${encodeURIComponent(entry.id)}`, "PATCH", { value, type: entry.type });
    else {
      const result = await api(envEndpoint, "POST", { key, value, type: "encrypted", target: ["production"] });
      if (result.failed?.length) throw new Error(`Vercel could not create ${key}; details were hidden.`);
    }
    console.log(`Synced ${key}`);
  }
  const after = await api(envEndpoint);
  if (!Array.isArray(after.envs)) throw new Error("Invalid Vercel verification response.");
  const changedIds = new Set(changes.filter((item) => item.entry).map((item) => item.entry.id));
  for (const before of listing.envs) {
    const current = after.envs.find((entry) => entry.id === before.id);
    if (!current || (!changedIds.has(before.id) && JSON.stringify(metadata(current)) !== JSON.stringify(metadata(before)))) throw new Error(`Unexpected environment change for ${before.key}; no verification receipt was saved.`);
    if (changedIds.has(before.id) && (current.type !== before.type || JSON.stringify(targets(current)) !== JSON.stringify(targets(before)))) throw new Error(`Unexpected scope/type change for ${before.key}.`);
  }
  await writeFile(receiptFile, JSON.stringify(makeReceipt(link, values, after.envs), null, 2) + "\n", { mode: 0o600 });
  console.log(`Production configuration paired (${changes.length} writes). Credentials and other environments were preserved.`);
  if (mode === "deploy") await vercel(["deploy", "--prod", "--yes", "--scope", link.orgId], undefined, true);
  else console.log("New values take effect on the next deployment. npm run deploy:vercel syncs before deploying.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
