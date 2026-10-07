import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client (FEAT-AUTH-001). Same origin as the app, so
 * no baseURL is needed. It holds no secrets: Google sign-in is a redirect to
 * /api/auth, an emailed link signs in on click, and the session arrives as an
 * httpOnly cookie.
 */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });

export const { signIn, signOut, useSession } = authClient;
