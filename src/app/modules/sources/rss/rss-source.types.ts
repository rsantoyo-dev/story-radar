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
  pollEveryMinutes: number;
  contentMode: RssContentMode;
};
