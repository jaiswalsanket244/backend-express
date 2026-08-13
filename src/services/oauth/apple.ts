import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { getProviderConfig } from "../../config/oauth";
import {
  decodeIdToken,
  exchangeCodeForToken,
  nameFromClaims,
  OAuthError,
  type OAuthProfile,
} from "./shared";

const config = getProviderConfig("apple");

const APPLE_AUDIENCE = "https://appleid.apple.com";

/**
 * Build the "Sign in with Apple" authorization URL. Apple requires
 * `response_mode=form_post` whenever the `email`/`name` scopes are requested, so
 * the callback arrives as a POST form body rather than a query redirect.
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    response_mode: "form_post",
    scope: config.scopes.join(" "),
    state,
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Apple's "client secret" is not a static string: it is a short-lived ES256 JWT
 * signed with the provider's private key, identifying the team + key + client.
 * Generated fresh per exchange (never stored). Requires real Apple credentials;
 * with placeholders this throws, which the caller maps to an OAuth error.
 */
export function generateClientSecret(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const options: SignOptions = {
    algorithm: "ES256",
    keyid: env.APPLE_KEY_ID,
    header: { alg: "ES256", kid: env.APPLE_KEY_ID },
  };
  // Apple accepts the "\n" escapes commonly stored in env files.
  const privateKey = env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  try {
    return jwt.sign(
      {
        iss: env.APPLE_TEAM_ID,
        iat: nowSeconds,
        exp: nowSeconds + 5 * 60,
        aud: APPLE_AUDIENCE,
        sub: config.clientId,
      },
      privateKey,
      options
    );
  } catch (err) {
    throw new OAuthError(
      "client_secret_failed",
      `Could not sign Apple client secret: ${(err as Error).message}`
    );
  }
}

/**
 * The `user` field Apple posts back (JSON) ONLY on the very first authorization,
 * carrying the name that isn't present in the `id_token`. Parsed best-effort.
 */
function nameFromUserField(userJson?: string): string | null {
  if (!userJson) return null;
  try {
    const parsed = JSON.parse(userJson) as {
      name?: { firstName?: string; lastName?: string };
    };
    const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(
      (p): p is string => typeof p === "string" && p.trim() !== ""
    );
    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}

/**
 * Exchange the authorization code for tokens and derive the profile from the
 * `id_token`. `userJson` is the optional first-login `user` form field.
 */
export async function exchangeCodeForProfile(
  code: string,
  userJson?: string
): Promise<OAuthProfile> {
  const tokens = await exchangeCodeForToken(config.tokenEndpoint, {
    code,
    client_id: config.clientId,
    client_secret: generateClientSecret(),
    redirect_uri: config.callbackUrl,
    grant_type: "authorization_code",
  });

  if (!tokens.id_token) {
    throw new OAuthError("no_id_token", "Apple did not return an id_token");
  }

  const claims = decodeIdToken(tokens.id_token);
  if (!claims.email || !claims.sub) {
    throw new OAuthError(
      "incomplete_profile",
      "Apple id_token missing email or sub"
    );
  }

  // Apple never puts the name in the id_token; use the first-login user field.
  const name = nameFromUserField(userJson) ?? nameFromClaims(claims);

  return {
    email: claims.email,
    name,
    providerId: claims.sub,
  };
}
