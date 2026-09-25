import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";

/**
 * Better Auth server configuration (FEAT-AUTH-001, AUTH-01).
 *
 * Sessions live in the database and travel as an httpOnly cookie; a short
 * signed cookie cache avoids a Neon round trip on every render. Google is the
 * only sign-in method during the alpha, so there is no password storage and no
 * transactional email here.
 *
 * The instance is created lazily, like `db`, so `next build` can import route
 * modules without the runtime secrets; the first real request still fails with
 * an explicit configuration error.
 */

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_REFRESH_AGE_SECONDS = 60 * 60 * 24;
const SESSION_COOKIE_CACHE_SECONDS = 5 * 60;
const COOKIE_PREFIX = "press-craftor";

export class AuthConfigError extends Error {}

function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new AuthConfigError("BETTER_AUTH_SECRET is not configured");
  }
  if (secret.length < 32) {
    throw new AuthConfigError(
      "BETTER_AUTH_SECRET must be at least 32 characters long",
    );
  }
  return secret;
}

/**
 * Base URL users sign in from. Defaults to RADAR_APP_URL so Instagram OAuth
 * and Google OAuth share one origin per environment.
 */
export function resolveAuthBaseUrl(): string {
  const raw =
    process.env.BETTER_AUTH_URL?.trim() || process.env.RADAR_APP_URL?.trim();
  if (!raw) {
    throw new AuthConfigError(
      "BETTER_AUTH_URL or RADAR_APP_URL must be configured",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AuthConfigError("BETTER_AUTH_URL must be an absolute URL");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new AuthConfigError("BETTER_AUTH_URL must use https outside localhost");
  }
  return url.origin;
}

function googleCredentials():
  | { clientId: string; clientSecret: string }
  | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** The login page uses this to explain a missing provider instead of failing. */
export function isGoogleSignInConfigured(): boolean {
  return googleCredentials() !== undefined;
}

function createAuth() {
  const baseURL = resolveAuthBaseUrl();
  const google = googleCredentials();

  return betterAuth({
    appName: "Press Craftor",
    baseURL,
    secret: requireAuthSecret(),
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
      // Keep the adapter default (`transaction: false`): the neon-http driver
      // cannot open transactions and would throw on the first write.
    }),
    emailAndPassword: { enabled: false },
    ...(google
      ? {
          socialProviders: {
            google: {
              clientId: google.clientId,
              clientSecret: google.clientSecret,
              prompt: "select_account" as const,
            },
          },
        }
      : {}),
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_COOKIE_CACHE_SECONDS,
        strategy: "compact",
      },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/**
 * Lazy facade over the Better Auth instance. `has` is implemented because
 * `toNextJsHandler` checks `"handler" in auth` before calling it.
 */
export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const active = getAuth();
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
  has(_target, property) {
    return property in getAuth();
  },
});

export type AuthSessionSnapshot = Auth["$Infer"]["Session"];
