import { env } from "./env";

/**
 * OAuth / OpenID Connect provider registry.
 *
 * This module is pure configuration: it describes *where* each provider's
 * endpoints live, *what* scopes we request, and *whether* the provider is
 * actually configured (real, non-empty credentials present). The per-provider
 * service modules in `src/services/oauth/*` read from here so all of the
 * endpoint/scope knowledge lives in one place and can be unit-reasoned about
 * without live credentials.
 */

/** The set of providers we support. */
export const PROVIDER_NAMES = ["google", "microsoft", "apple"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** Narrow an arbitrary string to a known provider name. */
export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

/**
 * The `response_mode` the provider uses to deliver the authorization code.
 * Apple posts an `application/x-www-form-urlencoded` body ("form_post"); Google
 * and Microsoft use a plain query-string redirect.
 */
export type ResponseMode = "query" | "form_post";

export interface OAuthProviderConfig {
  name: ProviderName;
  /** Authorization endpoint the browser is redirected to (step 1). */
  authorizationEndpoint: string;
  /** Token endpoint we exchange the code at, server-to-server (step 2). */
  tokenEndpoint: string;
  /**
   * OIDC userinfo endpoint. Optional: for all three providers we prefer to read
   * identity claims out of the returned `id_token`, but Google also exposes this
   * endpoint as a fallback.
   */
  userInfoEndpoint?: string;
  /** Scopes requested at the authorization endpoint. */
  scopes: string[];
  /** The public client identifier. */
  clientId: string;
  /** Where the provider redirects back to (must be registered with the provider). */
  callbackUrl: string;
  /** How the provider returns the code to the callback. */
  responseMode: ResponseMode;
  /**
   * True only when the provider has real, non-empty credentials. When false the
   * initiation route returns 503 rather than attempting a broken redirect.
   */
  configured: boolean;
}

/**
 * A credential value is "real" when it is present and not an obvious
 * placeholder. The env layer already collapses unset vars to "", so the primary
 * check is non-emptiness; we additionally reject common placeholder spellings so
 * a half-filled `.env` doesn't masquerade as configured.
 */
function isRealCredential(value: string): boolean {
  const v = value.trim();
  if (v === "") return false;
  const lowered = v.toLowerCase();
  if (lowered.startsWith("your-") || lowered.startsWith("changeme")) return false;
  if (lowered.includes("placeholder")) return false;
  return true;
}

/** Google — standard OIDC. */
const google: OAuthProviderConfig = {
  name: "google",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile"],
  clientId: env.GOOGLE_CLIENT_ID,
  callbackUrl: env.GOOGLE_CALLBACK_URL,
  responseMode: "query",
  configured:
    isRealCredential(env.GOOGLE_CLIENT_ID) &&
    isRealCredential(env.GOOGLE_CLIENT_SECRET),
};

/** Microsoft identity platform — standard OIDC, tenant-scoped. */
const microsoft: OAuthProviderConfig = {
  name: "microsoft",
  authorizationEndpoint: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
  scopes: ["openid", "email", "profile"],
  clientId: env.MICROSOFT_CLIENT_ID,
  callbackUrl: env.MICROSOFT_CALLBACK_URL,
  responseMode: "query",
  configured:
    isRealCredential(env.MICROSOFT_CLIENT_ID) &&
    isRealCredential(env.MICROSOFT_CLIENT_SECRET),
};

/**
 * Apple — "Sign in with Apple". Uses form_post and a client secret that is an
 * ES256 JWT signed with the provider's private key (generated at token-exchange
 * time, not stored). Requires client id + team id + key id + private key.
 */
const apple: OAuthProviderConfig = {
  name: "apple",
  authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
  tokenEndpoint: "https://appleid.apple.com/auth/token",
  scopes: ["name", "email"],
  clientId: env.APPLE_CLIENT_ID,
  callbackUrl: env.APPLE_CALLBACK_URL,
  responseMode: "form_post",
  configured:
    isRealCredential(env.APPLE_CLIENT_ID) &&
    isRealCredential(env.APPLE_TEAM_ID) &&
    isRealCredential(env.APPLE_KEY_ID) &&
    isRealCredential(env.APPLE_PRIVATE_KEY),
};

const REGISTRY: Record<ProviderName, OAuthProviderConfig> = {
  google,
  microsoft,
  apple,
};

/** Look up a provider's config by name. */
export function getProviderConfig(name: ProviderName): OAuthProviderConfig {
  return REGISTRY[name];
}
