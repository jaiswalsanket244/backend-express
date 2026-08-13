import { env } from "../../config/env";
import { getProviderConfig } from "../../config/oauth";
import {
  decodeIdToken,
  exchangeCodeForToken,
  nameFromClaims,
  OAuthError,
  type OAuthProfile,
} from "./shared";

const config = getProviderConfig("microsoft");

/**
 * Build the Microsoft identity platform authorization URL. Endpoints are already
 * tenant-scoped (see `src/config/oauth.ts`, default tenant "common").
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    response_mode: "query",
    scope: config.scopes.join(" "),
    state,
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange the authorization code for tokens and derive the profile from the
 * `id_token`. Microsoft may expose the email as `email` or, for some account
 * types, only as `preferred_username`; we accept either.
 */
export async function exchangeCodeForProfile(
  code: string
): Promise<OAuthProfile> {
  const tokens = await exchangeCodeForToken(config.tokenEndpoint, {
    code,
    client_id: config.clientId,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    redirect_uri: config.callbackUrl,
    grant_type: "authorization_code",
  });

  if (!tokens.id_token) {
    throw new OAuthError("no_id_token", "Microsoft did not return an id_token");
  }

  const claims = decodeIdToken(tokens.id_token);
  const email = claims.email ?? claims.preferred_username;
  // Microsoft uses `oid` (object id) as the stable per-user id; `sub` is
  // per-app-pairwise and also acceptable as a fallback.
  const providerId =
    (typeof claims.oid === "string" ? claims.oid : undefined) ?? claims.sub;

  if (!email || !providerId) {
    throw new OAuthError(
      "incomplete_profile",
      "Microsoft id_token missing email or subject id"
    );
  }

  return {
    email,
    name: nameFromClaims(claims),
    providerId,
  };
}
