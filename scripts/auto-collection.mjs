#!/usr/bin/env node
// Local test helper for the scheduled reader. Talks to the running dev server.
//
//   node --env-file=.env.local scripts/auto-collection.mjs preview <topicId> [minGrowth] [minEditorial] [maxAgeHours]
//       Read-only: which recent stories would be scoops. Starts nothing, spends no AI.
//   node --env-file=.env.local scripts/auto-collection.mjs enable <topicId> <lineId> [intervalHours] [minGrowth] [minEditorial] [maxAgeHours]
//       Saves and enables the reader for one Topic.
//   node --env-file=.env.local scripts/auto-collection.mjs disable <topicId> <lineId>
//   node --env-file=.env.local scripts/auto-collection.mjs lines <topicId>
//       Lists the Topic's editorial lines (to pick a lineId).
//   node --env-file=.env.local scripts/auto-collection.mjs tick
//       One real worker pass (needs AUTO_COLLECTION_WORKER_SECRET). Spends AI when a Topic is due or a scoop is prepared.
const base = (process.env.AUTO_COLLECTION_LOCAL_URL || "http://localhost:3000").replace(/\/+$/, "");
const collector = process.env.RADAR_COLLECTOR_SECRET?.trim();
const [command, topicId, ...rest] = process.argv.slice(2);

async function call(path, init = {}, secret = collector) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}
const topicPath = (suffix = "") => `/api/radar/topics/${encodeURIComponent(topicId)}${suffix}`;

try {
  if (command === "preview") {
    const [minGrowth, minEditorial, maxAgeHours] = rest;
    const query = new URLSearchParams({ preview: "1", ...(minGrowth ? { minGrowth } : {}), ...(minEditorial ? { minEditorial } : {}), ...(maxAgeHours ? { maxAgeHours } : {}) });
    const { thresholds, candidates } = await call(topicPath(`/auto-collection?${query}`));
    console.log("Thresholds:", thresholds);
    if (!candidates.length) console.log("No recent story clears the growth and editorial thresholds.");
    for (const c of candidates) console.log(`${c.qualifies ? "🔥 SCOOP" : "   no   "} ${c.alreadyFlagged ? "(already flagged) " : ""}${c.title ?? c.storyId}\n          ${c.reasons.join(" · ")}`);
  } else if (command === "enable" || command === "disable") {
    const [lineId, intervalHours = "4", minGrowth = "85", minEditorial = "80", maxAgeHours = "6"] = rest;
    const { settings } = await call(topicPath("/auto-collection"), { method: "PUT", body: JSON.stringify({
      enabled: command === "enable", lineId, intervalHours: Number(intervalHours), scoopMinGrowth: Number(minGrowth),
      scoopMinEditorial: Number(minEditorial), scoopMaxAgeHours: Number(maxAgeHours),
    }) });
    console.log(settings);
  } else if (command === "lines") {
    const body = await call(topicPath("/editorial-lines"));
    for (const line of body.lines ?? body) console.log(line.id, "·", line.name);
  } else if (command === "tick") {
    const secret = process.env.AUTO_COLLECTION_WORKER_SECRET?.trim();
    if (!secret) throw new Error("Set AUTO_COLLECTION_WORKER_SECRET in .env.local (and restart the dev server).");
    console.log(await call("/api/internal/auto-collection/tick", { method: "POST" }, secret));
  } else {
    console.log("Commands: preview | enable | disable | lines | tick (see the header of this file).");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
