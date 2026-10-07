/**
 * Transitional adapter (AUTH-05): many panels still receive the collector
 * secret as a prop and treat an empty one as "not connected". When the user
 * is signed in, roots pass this placeholder instead; the API never accepts it
 * as a secret and authorizes the request by its session cookie. Remove it
 * once panels stop taking a `secret` prop.
 */
export const SIGNED_IN_CREDENTIAL = "signed-in-session";
