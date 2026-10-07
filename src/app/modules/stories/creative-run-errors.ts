/** Shared errors keep repository reservations and API responses consistent. */
export class CreativeContentConflictError extends Error {}
/** The automatic image review flagged issues; an editor may still approve after checking the image. */
export class CreativeImageReviewBlockedError extends CreativeContentConflictError {
  constructor(message: string, readonly issues: string[]) { super(message); }
}
export class CreativeContentDailyLimitError extends Error {}
