import { DRAFT_2_STEPS, isDraft2Step, type Draft2StepKey } from "./draft-2-canvas.core";
import type { Draft2SessionSummary } from "./modules/draft2/draft2-session.repository";
import { AUTOPILOT_STEP_TITLE, type AutopilotJobView } from "./modules/draft2/draft2-autopilot.core";

/** A story in production as Today reads it: the dashboard's row, with where it stands in publishing. */
export type TodayStory = {
  storyId: string;
  title: string;
  sourceName: string;
  /** The article text's state: Draft 2 starts from it. */
  contentStatus: string;
  /** The destinations the story was published to, newest first. */
  published: readonly { platform: string; publishedAt?: string | Date }[];
};

export type TodayGroup = "running" | "needs-you" | "to-publish" | "published-today" | "waiting" | "not-started";

/** One card of Today: the story, its latest session when it has one, and what the editor can do. */
export type TodayCard = {
  story: TodayStory;
  session?: Draft2SessionSummary;
  group: TodayGroup;
  /** Where the story stands, in the editor's words. */
  line: string;
  /** The canvas screen to open: the session's step, or the overview. */
  step?: Draft2StepKey;
};

export const TODAY_GROUPS: readonly { key: TodayGroup; title: string; detail: string }[] = [
  { key: "running", title: "In progress", detail: "Draft 2 is working on these; open one to watch it." },
  { key: "needs-you", title: "Needs you", detail: "A step stopped for your decision, or failed." },
  { key: "to-publish", title: "Ready to publish", detail: "Approved as it stands; confirm the exact post to publish." },
  { key: "waiting", title: "Waiting to continue", detail: "The last step finished; the next waits for you or the autopilot." },
  { key: "published-today", title: "Published today", detail: "Out today, with what the carousel cost." },
  { key: "not-started", title: "Not started", detail: "Selected for production, with no Draft 2 session yet." },
];

/** The session's step as the canvas names its screen ("publication" is the publish screen; "mentions" the caption's). */
export function canvasStepOf(step: string): Draft2StepKey | undefined {
  const mapped = step === "publication" ? "publish" : step === "mentions" ? "caption" : step;
  return isDraft2Step(mapped) ? mapped : undefined;
}

const stepTitle = (step: string) => DRAFT_2_STEPS.find((entry) => entry.key === canvasStepOf(step))?.title ?? step;

const publishedTime = (value: string | Date | undefined): number => {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

/** Whether a time falls on the same calendar day as now, in the viewer's zone (or the one given, the tests'). */
export function sameDay(time: number, now: Date, timeZone?: string): boolean {
  if (!time) return false;
  const zone = timeZone ? { timeZone } : {};
  return new Date(time).toLocaleDateString("en-CA", zone) === now.toLocaleDateString("en-CA", zone);
}

/** A cost in micro-dollars as Today shows it. */
export const costLabel = (costMicros: number) => costMicros ? `≈US$${(costMicros / 1_000_000).toFixed(2)}` : "";

/**
 * Today's cards from the stories in production and their latest sessions
 * (2026-10-19, the editor: "gather what we have of v2 in Today"): each story
 * once, in the group its state puts it in, published-today first by the
 * publication, then by the session's last change, newest first.
 */
export function todayCards(stories: readonly TodayStory[], sessions: readonly Draft2SessionSummary[], now: Date, timeZone?: string, jobs: readonly AutopilotJobView[] = []): TodayCard[] {
  const byStory = new Map(sessions.map((session) => [session.storyId, session]));
  const jobByStory = new Map(jobs.map((job) => [job.storyId, job]));
  const cards = stories.map((story): TodayCard => {
    const session = byStory.get(story.storyId);
    // The autopilot on the server (2026-10-22): a job running is the story's state; one that stopped since the session last moved says why.
    const job = jobByStory.get(story.storyId);
    if (job?.status === "running") {
      return { story, session, group: "running", line: `Autopilot on the server: ${job.currentStep ? `${AUTOPILOT_STEP_TITLE[job.currentStep].toLowerCase()} running` : "between steps"}, to the ${AUTOPILOT_STEP_TITLE[job.until].toLowerCase()}`, step: session ? canvasStepOf(session.step) : undefined };
    }
    if (job && (job.status === "blocked" || job.status === "failed") && (!session || Date.parse(job.updatedAt) >= Date.parse(session.updatedAt))) {
      return { story, session, group: "needs-you", line: `Autopilot stopped: ${(job.outcome ?? "").replace(/\s+/g, " ").trim()}`, step: session ? canvasStepOf(session.step) : undefined };
    }
    const latestPublished = Math.max(0, ...story.published.map((entry) => publishedTime(entry.publishedAt)));
    if (latestPublished && sameDay(latestPublished, now, timeZone)) {
      return { story, session, group: "published-today", line: `Published ${story.published.map((entry) => entry.platform).join(" and ")}${session ? ` · ${costLabel(session.costMicros)}` : ""}`.trim(), step: session ? "publish" : undefined };
    }
    if (!session) return { story, group: "not-started", line: story.contentStatus === "ready" ? "Content ready: start Draft 2." : "Prepare the content first, then start Draft 2." };
    const step = canvasStepOf(session.step);
    const title = stepTitle(session.step);
    if (session.status === "running" && session.alive) return { story, session, group: "running", line: `${title} running`, step };
    if (session.approvedAt && !story.published.length) return { story, session, group: "to-publish", line: `Approved · ${costLabel(session.costMicros)}`.replace(/ · $/, ""), step: "publish" };
    if (session.status === "failed" || session.status === "needs-review" || session.status === "running") {
      const why = session.status === "running" ? "stopped mid-run; continue it" : session.error ? session.error.replace(/\s+/g, " ").trim() : session.status === "failed" ? "failed" : "needs your review";
      return { story, session, group: "needs-you", line: `${title}: ${why}`, step };
    }
    return { story, session, group: "waiting", line: `${title} done · ${costLabel(session.costMicros)}`.replace(/ · $/, ""), step };
  });
  const order: Record<TodayGroup, number> = { "needs-you": 0, running: 1, "to-publish": 2, waiting: 3, "not-started": 4, "published-today": 5 };
  const lastChange = (card: TodayCard) => card.group === "published-today" ? Math.max(0, ...card.story.published.map((entry) => publishedTime(entry.publishedAt))) : card.session ? Date.parse(card.session.updatedAt) : 0;
  return cards.sort((a, b) => order[a.group] - order[b.group] || lastChange(b) - lastChange(a));
}
