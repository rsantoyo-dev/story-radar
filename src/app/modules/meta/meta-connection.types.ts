/** Status shape returned to the browser — never includes token material. */
export type TopicMetaConnectionStatus = {
  connected: boolean;
  igUsername?: string;
  pageName?: string;
  tokenExpiresAt?: Date;
  connectedAt?: Date;
  connectedBy?: string;
  hasCustomApp: boolean;
};
