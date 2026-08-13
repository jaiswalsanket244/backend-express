import jwt from "jsonwebtoken";

/**
 * Normalized identity extracted from a provider after a successful code
 * exchange. This is the single shape the OAuth service upserts on, regardless of
 * which provider produced it.
 */
export interface OAuthProfile {
  /** Verified email address (used to match/link the local account). */
  email: string;
  /** Display name, when the provider supplies one. */
  name: string | null;
  /** The user's stable id at the provider (OIDC `sub`). */
  providerId: string;
}

/**
 * Raw token-endpoint response. Only the fields we consume are typed; providers
 * return more (e.g. `access_token`, `refresh_token`, `expires_in`).
 */
export interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  [key: string]: unknown;
}

/** Claims we read out of an OIDC `id_token`. */
export interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  [key: string]: unknown;
}

/** Raised when a provider HTTP call fails; carries a short machine reason. */
export class OAuthError extends Error {
  constructor(public readonly reason: string, message?: string) {
    super(message ?? reason);
    this.name = "OAuthError";
  }
}

/**
 * Exchange an authorization code at a token endpoint using the standard
 * `application/x-www-form-urlencoded` body. Shared by all three providers.
 */
export async function exchangeCodeForToken(
  tokenEndpoint: string,
  params: Record<string, string>
): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    });
  } catch (err) {
    throw new OAuthError(
      "token_exchange_failed",
      `Network error contacting token endpoint: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new OAuthError(
      "token_exchange_failed",
      `Token endpoint returned ${response.status}: ${text}`
    );
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Decode (without verifying the signature) the claims of an OIDC `id_token`.
 *
 * We trust the token because it was just delivered over TLS directly from the
 * provider's token endpoint in response to our authenticated exchange — a
 * pattern the OIDC spec explicitly permits for the code flow. Verifying the
 * signature would additionally require fetching each provider's JWKS, which is
 * out of scope while credentials are placeholders.
 */
export function decodeIdToken(idToken: string): IdTokenClaims {
  const decoded = jwt.decode(idToken);
  if (!decoded || typeof decoded === "string") {
    throw new OAuthError("invalid_id_token", "id_token could not be decoded");
  }
  return decoded as IdTokenClaims;
}

/**
 * Best-effort display name from OIDC claims: prefer an explicit `name`, else
 * join given/family names, else fall back to null.
 */
export function nameFromClaims(claims: IdTokenClaims): string | null {
  if (claims.name && claims.name.trim() !== "") return claims.name;
  const parts = [claims.given_name, claims.family_name].filter(
    (p): p is string => typeof p === "string" && p.trim() !== ""
  );
  return parts.length > 0 ? parts.join(" ") : null;
}
