import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import {
  getProviderConfig,
  isProviderName,
  type ProviderName,
} from "../../config/oauth";
import { issueTokensForUser, type TokenPair } from "../auth.service";
import { createState, verifyState } from "./state";
import { OAuthError, type OAuthProfile } from "./shared";
import * as google from "./google";
import * as microsoft from "./microsoft";
import * as apple from "./apple";

/**
 * Orchestrates the OAuth flow for all providers:
 *   1. `startOAuth`   — validate provider, build a signed-state authorize URL.
 *   2. `handleCallback` — validate state, exchange the code, upsert/link the
 *      user, and issue the SAME app tokens as the custom flow.
 *
 * ── Frontend redirect contract (DOCUMENTED) ──────────────────────────────────
 * On success we 302-redirect to:
 *     `${FRONTEND_URL}/auth/callback#accessToken=<jwt>&refreshToken=<jwt>`
 * The tokens are placed in the URL *fragment* (after `#`) deliberately: the
 * fragment is never sent to any server (not even in the `Referer` header) and is
 * not written to server access logs, so the tokens stay on the client. The
 * frontend reads `window.location.hash`, stores the tokens, and clears the hash.
 *
 * On any failure we 302-redirect to:
 *     `${FRONTEND_URL}/login?error=<machine_reason>`
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Per-provider module surface the service depends on. */
interface ProviderModule {
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForProfile(
    code: string,
    userJson?: string
  ): Promise<OAuthProfile>;
}

const MODULES: Record<ProviderName, ProviderModule> = {
  google,
  microsoft,
  apple,
};

/** Parsed inputs a callback may carry (query for google/ms, form for apple). */
export interface CallbackInput {
  code?: string;
  state?: string;
  /** Provider-reported error (e.g. user denied consent). */
  error?: string;
  /** Apple-only first-login `user` JSON blob (name lives here, not in id_token). */
  userJson?: string;
}

/**
 * Resolve a raw `:provider` path param to a known, currently-configured
 * provider — or throw the correct HTTP error:
 *   - unknown provider  → 400
 *   - known but unconfigured (placeholder creds) → 503
 */
function requireConfiguredProvider(providerRaw: string): ProviderName {
  if (!isProviderName(providerRaw)) {
    throw new HttpError(400, `Unknown OAuth provider: ${providerRaw}`);
  }
  const config = getProviderConfig(providerRaw);
  if (!config.configured) {
    throw new HttpError(503, `${providerRaw} OAuth is not configured`);
  }
  return providerRaw;
}

/**
 * Step 1 — begin the flow. Returns the provider authorization URL (including a
 * freshly signed `state`) that the caller should 302-redirect the browser to.
 */
export function startOAuth(providerRaw: string): string {
  const provider = requireConfiguredProvider(providerRaw);
  const state = createState(provider);
  return MODULES[provider].buildAuthorizationUrl(state);
}

/**
 * Create a new OAuth user, or link the provider onto an existing account matched
 * by email.
 *
 * Linking policy:
 *   - No existing user → create with `provider=<provider>`, `providerId`,
 *     `passwordHash=null`.
 *   - Existing local account (has a password) → keep `provider="local"` but
 *     record `providerId` so the accounts are linked; the user can still sign in
 *     either way. (We never overwrite a password-bearing account's provider.)
 *   - Existing OAuth-only account → set `provider`/`providerId` to this provider.
 *   - Backfill `name` only when the account doesn't already have one.
 */
async function upsertOAuthUser(
  provider: ProviderName,
  profile: OAuthProfile
): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (!existing) {
    return prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        provider,
        providerId: profile.providerId,
        passwordHash: null,
      },
    });
  }

  const isLocalAccount = existing.passwordHash !== null;
  return prisma.user.update({
    where: { id: existing.id },
    data: {
      providerId: profile.providerId,
      provider: isLocalAccount ? existing.provider : provider,
      name: existing.name ?? profile.name,
    },
  });
}

/**
 * Step 2 — complete the flow: validate `state`, exchange the `code`, fetch the
 * profile, upsert/link the user, and issue app tokens. Throws `HttpError` for
 * routing problems and `OAuthError` for provider/flow failures; the route maps
 * both to the frontend error redirect.
 */
export async function handleCallback(
  providerRaw: string,
  input: CallbackInput
): Promise<TokenPair> {
  const provider = requireConfiguredProvider(providerRaw);

  // The provider itself may report an error (e.g. access_denied).
  if (input.error) {
    throw new OAuthError(input.error, `Provider reported error: ${input.error}`);
  }

  if (!input.state || !verifyState(input.state, provider)) {
    throw new OAuthError("invalid_state", "Missing or invalid CSRF state");
  }

  if (!input.code) {
    throw new OAuthError("missing_code", "Authorization code was not provided");
  }

  const profile = await MODULES[provider].exchangeCodeForProfile(
    input.code,
    input.userJson
  );

  const user = await upsertOAuthUser(provider, profile);
  return issueTokensForUser(user);
}

/** Build the success redirect (tokens in the URL fragment — see contract above). */
export function frontendSuccessUrl(tokens: TokenPair): string {
  const params = new URLSearchParams({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return `${env.FRONTEND_URL}/auth/callback#${params.toString()}`;
}

/** Build the failure redirect (`?error=<reason>` on the login page). */
export function frontendErrorUrl(err: unknown): string {
  const reason =
    err instanceof OAuthError
      ? err.reason
      : err instanceof HttpError
        ? err.message
        : "oauth_failed";
  const params = new URLSearchParams({ error: reason });
  return `${env.FRONTEND_URL}/login?${params.toString()}`;
}
