/**
 * Guided brand setup: identity → sources → channels. Each step is derived from
 * the brand's records; identity also needs the editor's explicit confirmation,
 * because a fresh creative profile is filled with generic defaults.
 */
export type TopicSetupStep = "identity" | "sources" | "channels";

export type TopicSetupSignals = {
  identityConfirmedAt: string | null;
  completedAt: string | null;
  hasLogo: boolean;
  audience: string;
  language: string;
  paletteColors: number;
  rssSources: number;
  aiResearchEnabled: boolean;
  documents: number;
  facebookPage: boolean;
  instagramDirect: boolean;
};

export type TopicSetupStatus = {
  identity: { done: boolean; confirmed: boolean; missing: string[] };
  sources: { done: boolean; count: number };
  channels: { done: boolean; via: "facebook" | "instagram" | null };
  /** The first step still to do, or "finish" when only the final confirmation remains. */
  nextStep: TopicSetupStep | "finish" | "done";
  readyToComplete: boolean;
  completed: boolean;
};

/** What the brand's identity still lacks before it can be confirmed. */
export function identityMissing(signals: Pick<TopicSetupSignals, "hasLogo" | "audience" | "language" | "paletteColors">): string[] {
  const missing: string[] = [];
  if (!signals.language.trim()) missing.push("Choose the publication language.");
  if (!signals.audience.trim()) missing.push("Describe the audience.");
  if (signals.paletteColors < 2) missing.push("Choose at least two brand colors.");
  if (!signals.hasLogo) missing.push("Upload the brand logo.");
  return missing;
}

export function topicSetupStatus(signals: TopicSetupSignals): TopicSetupStatus {
  const missing = identityMissing(signals);
  const confirmed = signals.identityConfirmedAt !== null;
  const identity = { done: confirmed && missing.length === 0, confirmed, missing };
  const count = signals.rssSources + signals.documents + (signals.aiResearchEnabled ? 1 : 0);
  const sources = { done: count > 0, count };
  const via = signals.facebookPage ? "facebook" as const : signals.instagramDirect ? "instagram" as const : null;
  const channels = { done: via !== null, via };
  const readyToComplete = identity.done && sources.done && channels.done;
  const completed = signals.completedAt !== null;
  const nextStep = completed ? "done"
    : !identity.done ? "identity"
    : !sources.done ? "sources"
    : !channels.done ? "channels"
    : "finish";
  return { identity, sources, channels, nextStep, readyToComplete, completed };
}
