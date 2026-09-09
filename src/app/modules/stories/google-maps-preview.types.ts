export type MapsPreviewInput = {
  mode: "google" | "demo";
  name: string;
  municipality: string;
  region: string;
  country: string;
  languageCode?: string;
};
export type MapsPreviewAttribution = { name: string; url?: string };
export type MapsPreviewCard = {
  kind: "map" | "photo";
  image: string;
  width: number;
  height: number;
  label: string;
  attributions: MapsPreviewAttribution[];
};
export type MapsPreviewResult = {
  mode: "google" | "demo";
  status: "candidate" | "ambiguous" | "not-found" | "demo";
  exportable: false;
  preparedAt: string;
  expiresAt: string;
  brand: { name: string; color: string };
  place?: { name: string; address: string; sourceUrl: string; nameMatch: "literal" | "search-candidate" };
  candidates: { name: string; address: string; sourceUrl: string; matchesScope: boolean; exclusions: string[]; attributions: MapsPreviewAttribution[] }[];
  cards: MapsPreviewCard[];
  reasons: string[];
  requests: number;
};
export type MapsPreviewConfiguration = {
  enabled: boolean;
  configured: boolean;
  signingConfigured: boolean;
  maxPhotos: number;
  maxPreviewsPerDay: number;
};
