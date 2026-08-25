// Keep this legacy app-router path subject to the same authentication and
// topic scoping as the public API route. It must not expose the old static
// source configuration now that feeds can be configured by a user.
export { GET } from "@/app/api/sources/rss/[sourceId]/route";
