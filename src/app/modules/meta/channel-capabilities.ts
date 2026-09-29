/**
 * A channel's readiness, as one small shared shape both the Instagram
 * connection and the new Facebook Page connection (PUB-09) populate — the
 * "Connected / Can publish / Can sync / Metrics available" separation PUB-09
 * and UX-19's AC1 both ask for verbatim. Until now this was two separate
 * enums (MetaConnectionState, PublishingAccessState) plus inline ternaries in
 * meta-connection-panel.tsx; this module centralizes that mapping instead of
 * a third copy for Facebook. No "server-only" import: pure functions over
 * already-derived state, unit-tested directly, same discipline as
 * meta-connection-state.ts and instagram-publishing-access.ts.
 */

import type { MetaConnectionState } from "./meta-connection-state";
import type { PublishingAccessState } from "./instagram-publishing-access";

export type CapabilityState = "unknown" | "unavailable" | "available" | "needs-attention";

export type ChannelCapabilities = {
  connected: boolean;
  canPublish: CapabilityState;
  canSync: CapabilityState;
  metricsAvailable: CapabilityState;
};

/**
 * canPublish comes from the publishing preflight, not the connection state:
 * a connection can be "operational" (insights verified) while publishing is
 * still unverified, or vice versa — they are genuinely independent checks.
 * canSync/metricsAvailable mirror the exact ternaries this replaces in
 * meta-connection-panel.tsx: sync only needs a live, non-expired connection;
 * metrics specifically needs a proven ("operational") one.
 */
export function deriveInstagramChannelCapabilities(input: {
  connectionState: MetaConnectionState;
  publishingState: PublishingAccessState;
}): ChannelCapabilities {
  return {
    connected: input.connectionState !== "disconnected",
    canPublish: publishingCapability(input.publishingState),
    canSync: syncCapability(input.connectionState),
    metricsAvailable: metricsCapability(input.connectionState),
  };
}

function publishingCapability(state: PublishingAccessState): CapabilityState {
  switch (state) {
    case "enabled":
      return "available";
    case "disconnected":
      return "unavailable";
    case "needs-reconnect":
    case "missing-permission":
    case "quota-exhausted":
    case "rate-limited":
      return "needs-attention";
    case "unverified":
    case "unavailable":
    case "connection-changed":
      return "unknown";
  }
}

function syncCapability(state: MetaConnectionState): CapabilityState {
  switch (state) {
    case "disconnected":
      return "unavailable";
    case "needs-reconnect":
      return "needs-attention";
    case "connected-without-insights":
    case "operational":
      return "available";
  }
}

function metricsCapability(state: MetaConnectionState): CapabilityState {
  switch (state) {
    case "disconnected":
      return "unavailable";
    case "needs-reconnect":
    case "connected-without-insights":
      return "needs-attention";
    case "operational":
      return "available";
  }
}

/**
 * canPublish is "available" only when the Page's tasks include
 * CREATE_CONTENT/MANAGE and the last live verification of the Page token
 * succeeded; granted-but-unverified stays "needs-attention". A Page with
 * neither task is a real, known gap, so that reports "unavailable". Each
 * publication still re-checks access live (PUB-10); this is a summary.
 * canSync and metricsAvailable stay "unavailable": neither is built for
 * Facebook yet.
 */
const FACEBOOK_PUBLISH_TASKS = new Set(["CREATE_CONTENT", "MANAGE"]);

export function deriveFacebookChannelCapabilities(input: {
  connected: boolean;
  tokenExpired: boolean;
  pageTasks: string[];
  /** The last live Page verification succeeded. */
  verified?: boolean;
}): ChannelCapabilities {
  const canPublish: CapabilityState = !input.connected
    ? "unavailable"
    : input.tokenExpired
      ? "needs-attention"
      : input.pageTasks.some((task) => FACEBOOK_PUBLISH_TASKS.has(task))
        ? input.verified ? "available" : "needs-attention"
        : "unavailable";
  return {
    connected: input.connected,
    canPublish,
    canSync: "unavailable",
    metricsAvailable: "unavailable",
  };
}
