/** Shared identity and result rules. Provider tokens never appear in this contract. */
export type MetaPlatform = "instagram" | "facebook";
export type MetaDestination = {
  platform: MetaPlatform;
  accountId: string;
  connectionVersion: string;
  mechanism: "instagram-login" | "facebook-login" | "facebook-page";
};
export type MetaDeliveryStatus =
  | "queued" | "preparing" | "creating-containers" | "containers-ready"
  | "publishing" | "pending-confirmation" | "published"
  | "failed" | "suspended" | "cancelled" | "scheduled";
export type MetaOrderStatus = "queued" | "partial" | "published" | "failed" | "cancelled";

/** One account is one destination even if both OAuth mechanisms can reach it. */
export function uniqueDestinations(destinations: readonly MetaDestination[]): MetaDestination[] {
  const unique = new Map<string, MetaDestination>();
  for (const destination of destinations) {
    if (!destination.accountId.trim()) throw new Error("A destination needs a remote account ID.");
    if (destination.platform === "facebook" && destination.mechanism !== "facebook-page") {
      throw new Error("Facebook publishing requires a Page destination.");
    }
    if (destination.platform === "instagram" && destination.mechanism === "facebook-page") {
      throw new Error("An Instagram destination requires Instagram authorization.");
    }
    const key = `${destination.platform}:${destination.accountId}`;
    const previous = unique.get(key);
    if (previous && previous.connectionVersion !== destination.connectionVersion) {
      throw new Error("Choose one active connection revision for this destination.");
    }
    if (!previous) unique.set(key, destination);
  }
  if (unique.size === 0) throw new Error("Select at least one publishing destination.");
  return [...unique.values()];
}

export function metaOrderStatus(statuses: readonly MetaDeliveryStatus[]): MetaOrderStatus {
  if (statuses.length === 0) throw new Error("An order needs a delivery.");
  if (statuses.every(status => status === "published")) return "published";
  if (statuses.some(status => status === "published")) return "partial";
  if (statuses.every(status => status === "cancelled")) return "cancelled";
  if (statuses.every(status => status === "failed" || status === "suspended" || status === "cancelled")) return "failed";
  return "queued";
}
