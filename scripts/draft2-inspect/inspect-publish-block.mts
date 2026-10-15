import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { publicationTarget } from "../../src/app/modules/draft2/draft2-publication.types";
import { shownAttempt } from "../../src/app/modules/draft2/draft2-images.types";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: why a Draft 2 session cannot be approved for publishing.
const [s] = await sql`select * from draft2_sessions where story_id = ${process.argv[2]} order by updated_at desc limit 1`;
console.log("session", s.id, "| step", s.step, "| status", s.status, "| error", s.error ?? "", "| age s", Math.round((Date.now() - new Date(s.updated_at).getTime()) / 1000));
console.log("images", s.images?.status, "run", s.images?.runId, "| caption", s.caption?.status, "for run", s.caption?.imagesRunId, "| publication", s.publication ? JSON.stringify({ approvedAt: s.publication.approvedAt, imagesRunId: s.publication.imagesRunId, draftId: s.publication.draftId }) : "none");
for (const slide of s.images?.slides ?? []) {
  const shown = shownAttempt(slide);
  const last = slide.attempts.at(-1);
  console.log(`  ${slide.label}: shows v${shown?.version ?? "-"} · last v${last?.version} ${last?.status}${last?.error ? " · " + String(last.error).slice(0, 160) : ""}`);
}
try {
  const target = publicationTarget(s);
  console.log("target ok · issues to acknowledge:", target.issues.length, target.issues.slice(0, 4));
} catch (error) {
  console.log("BLOCKED:", (error as Error).message);
}
import { publicationCurrent, targetPostText } from "../../src/app/modules/draft2/draft2-publication.types";
try {
  const target = publicationTarget(s);
  const current = publicationCurrent(s.publication, target);
  console.log("approved copy current:", current);
  if (!current && s.publication) {
    const now = targetPostText(target);
    const then = s.publication.postText ?? "";
    console.log("post text same:", now === then, "| slides same:", JSON.stringify(s.publication.slides?.map((x: { slide: string; version: number }) => [x.slide, x.version])) === JSON.stringify(target.slides.map((x) => [x.slide, x.version])));
    if (now !== then) {
      const a = then.split("\n"), b = now.split("\n");
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log(`  line ${i + 1}\n   approved: ${a[i] ?? "(none)"}\n   now:      ${b[i] ?? "(none)"}`); }
    }
  }
} catch (error) { console.log("target:", (error as Error).message); }
