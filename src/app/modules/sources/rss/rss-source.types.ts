export type RssContentMode =
  | "excerpt"
  | "full"
  | "auto";

export type RssSourceConfig = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;

  language: string;
  region: string;

  tags: string[];
  /**
   * Topic-specific editorial importance. Seeded/global sources may omit it,
   * while sources loaded through the topic catalog provide a value from 0–100.
   */
  priority?: number;
  pollEveryMinutes: number;
  contentMode: RssContentMode;
};
