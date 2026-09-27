import "server-only";

import { parseFacebookPageList, type FacebookPageList } from "./facebook-page-selection";

/** Read-only Meta Graph call. The user token and returned Page tokens stay on the server. */
export async function fetchFacebookPages(input: {
  userAccessToken: string;
  graphVersion: `v${number}.${number}`;
  after?: string;
  fetcher?: typeof fetch;
}): Promise<FacebookPageList> {
  if (!/^v\d+\.\d+$/.test(input.graphVersion) || !input.userAccessToken ||
    (input.after && input.after.length > 1024)) throw new Error("Invalid Page discovery input");
  const url = new URL(`https://graph.facebook.com/${input.graphVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,tasks,instagram_business_account");
  url.searchParams.set("limit", "50");
  if (input.after) url.searchParams.set("after", input.after);
  const response = await (input.fetcher ?? fetch)(url, {
    headers: { Authorization: `Bearer ${input.userAccessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Meta Page discovery failed");
  return parseFacebookPageList(await response.json());
}
