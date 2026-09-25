import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client (FEAT-AUTH-001). Same origin as the app, so
 * no baseURL is needed. It holds no secrets: sign-in with Google is a redirect
 * to /api/auth, and the session arrives as an httpOnly cookie.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
