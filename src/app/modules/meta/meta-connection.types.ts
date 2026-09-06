import type { MetaConnectionState } from "./meta-connection-state";

export type { MetaConnectionState } from "./meta-connection-state";

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
};
