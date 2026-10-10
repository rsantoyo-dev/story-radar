import { Draft2InputError } from "./draft2-facts.types";
import { funnelVersions } from "./draft2-funnel";
import { shownAttempt, slideSettled, type Draft2Images, type Draft2SlideImage } from "./draft2-images.types";
import { captionPostText, type Draft2Caption, type Draft2CaptionCandidate } from "./draft2-caption.types";
import { confirmedMentions, sameMentions, type Draft2Mentions } from "./draft2-mentions.types";

/**
 * Publication, the last Draft 2 step: the editor approves the carousel as it
 * stands (each slide's shown image and the chosen caption), and the program
 * copies it once into v1's rows (a brief, a draft and an image batch, all
 * approved, under the `draft2` provider, which v1's Studio and daily
 * preparation never show), so v1's publication freezes its immutable
 * package and publishes it to Facebook, Instagram or both, with its queue,
 * retries and permalinks. Everything here is pure: the contract, what can
 * be approved, and the snapshot that makes the copy idempotent.
 */
export const DRAFT2_PROVIDER = "draft2";
/** v1's carousel limits (instagram-publication-package.ts): 2 to 10 images. */
export const PUBLICATION_MIN_SLIDES = 2;
export const PUBLICATION_MAX_SLIDES = 10;

/** One slide as it was approved: the image version it shows and that image's hash. */
export type Draft2PublishedSlide = { slide: string; label: string; order: number; version: number; sha256: string };

export type Draft2Publication = {
  /** The v1 rows the carousel was copied into; v1's publication panels act on them. */
  draftId: string;
  batchId: string;
  /** What was approved, so the same carousel is never copied twice. */
  snapshotHash: string;
  imagesRunId: string;
  captionId: string;
  slides: Draft2PublishedSlide[];
  /** The text v1 posts: the caption, its credits and its hashtags. */
  postText: string;
  approvedAt: string;
  /** The review issues the editor saw and published anyway. */
  acknowledgedIssues: string[];
};

/** What the editor approves: each slide's shown image, the chosen caption, and what the review left for them to check. */
export type Draft2PublicationTarget = {
  slides: (Draft2PublishedSlide & { image: Draft2SlideImage })[];
  caption: Draft2CaptionCandidate;
  credits: string[];
  /** Slides whose shown image did not pass Sol's review, in a line each. */
  issues: string[];
  imagesRunId: string;
};

/**
 * The carousel as it can be approved: every slide shows a finished image,
 * the caption's run finished with a chosen version that follows these
 * images and tags the accounts confirmed now, and the carousel fits v1's
 * limits.
 */
export function publicationTarget(session: { images?: Draft2Images | null; caption?: Draft2Caption | null; mentions?: Draft2Mentions | null }): Draft2PublicationTarget {
  const images = session.images;
  if (!images || images.status === "running" || images.status === "paused" || !images.slides.every(slideSettled)) throw new Draft2InputError("Finish the images first.");
  const shown = images.slides.map((slide) => ({ slide, attempt: shownAttempt(slide) }));
  const missing = shown.filter(({ attempt }) => !attempt?.sha256).map(({ slide }) => slide.label);
  if (missing.length) throw new Draft2InputError(`${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no image. Make ${missing.length === 1 ? "it" : "them"} first.`);
  if (shown.length < PUBLICATION_MIN_SLIDES || shown.length > PUBLICATION_MAX_SLIDES) throw new Draft2InputError(`A carousel publishes ${PUBLICATION_MIN_SLIDES} to ${PUBLICATION_MAX_SLIDES} images; this one has ${shown.length}.`);
  const caption = session.caption;
  if (!caption || caption.status === "running" || caption.status === "paused") throw new Draft2InputError("Write the caption first.");
  const chosenId = caption.editorChoiceId ?? caption.winnerId;
  const chosen = chosenId ? funnelVersions(caption.rounds).find((version) => version.candidate.id === chosenId) : undefined;
  if (!chosen) throw new Draft2InputError("The caption has no version to publish yet. Choose a caption first.");
  if (caption.imagesRunId !== images.runId) throw new Draft2InputError("The images changed since this caption was written. Write the caption again.");
  if (!sameMentions(caption.mentions, confirmedMentions(session.mentions))) throw new Draft2InputError("The accounts to tag changed since this caption was written. Write the caption again.");
  const issues = shown.flatMap(({ slide, attempt }) => {
    const review = attempt!.review;
    if (review?.status === "passed") return [];
    if (attempt!.kind === "correct") return [`${slide.label}: corrected and not reviewed again.`];
    if (review?.status === "issues") return [`${slide.label}: ${review.issues.join(" ")}`];
    return [`${slide.label}: not reviewed.`];
  });
  return {
    slides: shown.map(({ slide, attempt }) => ({ slide: slide.slide, label: slide.label, order: slide.order, version: attempt!.version, sha256: attempt!.sha256!, image: slide })),
    caption: chosen.candidate, credits: caption.credits ?? [], issues, imagesRunId: images.runId,
  };
}

/** The text the target posts: the caption, its credits and its hashtags (captionPostText). */
export const targetPostText = (target: Pick<Draft2PublicationTarget, "caption" | "credits">) =>
  captionPostText({ text: target.caption.text, credits: target.credits, hashtags: target.caption.hashtags });

/**
 * Whether the approved copy is still the carousel as it stands: the same
 * images run, each slide on the same image, and the same post text. A
 * caption's ids start again in every run, so the text is compared, not the id.
 */
export function publicationCurrent(publication: Pick<Draft2Publication, "imagesRunId" | "slides" | "postText"> | null | undefined, target: Draft2PublicationTarget | undefined): boolean {
  if (!publication || !target || publication.imagesRunId !== target.imagesRunId || publication.slides.length !== target.slides.length) return false;
  return publication.slides.every((slide, index) => slide.slide === target.slides[index].slide && slide.version === target.slides[index].version && slide.sha256 === target.slides[index].sha256)
    && publication.postText === targetPostText(target);
}
