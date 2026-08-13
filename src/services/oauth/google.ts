import { env } from "../../config/env";
import { getProviderConfig } from "../../config/oauth";
import {
  decodeIdToken,
  exchangeCodeForToken,
  nameFromClaims,
  OAuthError,
  type OAuthProfile,
} from "./shared";

const config = getProviderConfig("google");

/**
 * Build the Google authorization URL the browser is redirected to. `access_type`
 * + `prompt` are Google-specific niceties; the rest is standard OIDC.
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens and derive the user's profile from
 * the returned `id_token`.
 */
export async function exchangeCodeForProfile(
  code: string
): Promise<OAuthProfile> {
  const tokens = await exchangeCodeForToken(config.tokenEndpoint, {
    code,
    client_id: config.clientId,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: config.callbackUrl,
    grant_type: "authorization_code",
  });

  if (!tokens.id_token) {
    throw new OAuthError("no_id_token", "Google did not return an id_token");
  }

  const claims = decodeIdToken(tokens.id_token);
  if (!claims.email || !claims.sub) {
    throw new OAuthError(
      "incomplete_profile",
      "Google id_token missing email or sub"
    );
  }

  return {
    email: claims.email,
    name: nameFromClaims(claims),
    providerId: claims.sub,
  };
}
