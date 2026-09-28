import type { PublishingAccessState } from "./instagram-publishing-access";
import type { MetaConnectionState } from "./meta-connection-state";
import type { ChannelCapabilities } from "./channel-capabilities";

export type { MetaConnectionState } from "./meta-connection-state";

/** Per-run counts of an IG-02 media sync page; `error` marks a partial failure. */
export type MediaSyncSummary = {
  imported: number;
  updated: number;
  carousels: number;
  error?: string;
};

/** Status shape returned to the browser — never includes token material. */
export type TopicMetaConnectionStatus = {
  connected: boolean;
  state: MetaConnectionState;
  igUsername?: string;
  pageName?: string;
  tokenExpiresAt?: Date;
  connectedAt?: Date;
  connectedBy?: string;
  hasCustomApp: boolean;
  publishing?: { state: PublishingAccessState; message: string };
  grantedPermissions?: string[];
  lastVerifiedAt?: Date;
  lastVerificationError?: string;
  /** IG-02 media sync (see MediaSyncSummary). */
  lastMediaSyncAt?: Date;
  lastMediaSyncCursor?: string;
  lastMediaSyncSummary?: MediaSyncSummary;
};

/**
 * A topic's Facebook Page connection (PUB-09), kept fully separate from the
 * Instagram Login status above. Never includes token material.
 */
export type TopicFacebookConnectionStatus = {
  connected: boolean;
  needsReconnect: boolean;
  pageId?: string;
  pageName?: string;
  pageTasks: string[];
  linkedIgUserId?: string;
  linkedIgUsername?: string;
  tokenExpiresAt?: Date;
  connectedAt?: Date;
  hasCustomApp: boolean;
  grantedPermissions: string[];
  lastVerifiedAt?: Date;
  lastVerificationError?: string;
  capabilities: ChannelCapabilities;
};

/** One Page offered in the picker — public fields only, never the Page token. */
export type FacebookPageChoice = {
  pageId: string;
  pageName: string;
  tasks: string[];
  linkedIgUserId?: string;
  linkedIgUsername?: string;
};
