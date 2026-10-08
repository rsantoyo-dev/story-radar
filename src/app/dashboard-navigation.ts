export type DashboardView =
  | "today"
  | "discover"
  | "production"
  | "publications"
  | "results"
  | "identity"
  | "strategy"
  | "sources"
  | "channels"
  | "topics"
  | "admin";

export function dashboardViewFromHash(hash: string): DashboardView {
  if (!hash || hash === "#overview") return "today";
  if (hash === "#topics" || hash === "#configuration") return "topics";
  if (hash.startsWith("#discover") || hash === "#collect" || hash === "#optimization" || hash.startsWith("#stories/collected") || hash === "#stories") return "discover";
  if (hash.startsWith("#stories/selected") || hash.startsWith("#production")) return "production";
  if (hash === "#editorial-instagram" || hash.startsWith("#publications")) return "publications";
  if (hash.startsWith("#results")) return "results";
  if (hash === "#editorial-creative" || hash.startsWith("#creative-profile-") || hash.startsWith("#identity")) return "identity";
  if (["#editorial", "#editorial-lenses", "#preferences"].includes(hash) || hash.startsWith("#strategy")) return "strategy";
  if (hash.startsWith("#sources")) return "sources";
  if (hash === "#editorial-meta" || hash.startsWith("#channels")) return "channels";
  if (hash === "#settings" || hash.startsWith("#admin")) return "admin";
  return "today";
}

export const DASHBOARD_VIEW_TITLES: Record<DashboardView, string> = {
  today: "Today",
  discover: "Discover",
  production: "Production",
  publications: "Publications",
  results: "Results",
  identity: "Creative identity",
  strategy: "Editorial strategy",
  sources: "Sources",
  channels: "Channels",
  topics: "Brands",
  admin: "Administration",
};
