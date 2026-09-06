import type { MetaConnectionState } from "./meta-connection-state";

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
  grantedPermissions?: string[];
  lastVerifiedAt?: Date;
  lastVerificationError?: string;
  /** IG-02 media sync (see MediaSyncSummary). */
  lastMediaSyncAt?: Date;
  lastMediaSyncCursor?: string;
  lastMediaSyncSummary?: MediaSyncSummary;
};
