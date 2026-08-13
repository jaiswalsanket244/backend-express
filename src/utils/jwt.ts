import { createHash, randomUUID } from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Claims carried by our JWTs. `sub` is the user id; extra fields may be added later.
 * Refresh tokens additionally carry a `jti` (token id) so a specific token can be
 * looked up / rotated / revoked in the database.
 */
export interface TokenPayload {
  sub: string;
  email?: string;
  jti?: string;
  [key: string]: unknown;
}

/**
 * Sign a short-lived access token.
 */
export function signAccessToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

/**
 * Sign a long-lived refresh token.
 */
export function signRefreshToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

/**
 * Verify and decode an access token. Throws if invalid/expired.
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

/**
 * Verify and decode a refresh token. Throws if invalid/expired.
 */
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

/**
 * Generate a fresh, unique token id (used as the refresh token's `jti`).
 */
export function newTokenId(): string {
  return randomUUID();
}

/**
 * Deterministically hash a raw token for storage. We only ever persist this
 * digest in the DB — never the raw refresh token.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compute the absolute expiry Date for a freshly issued refresh token, aligned
 * with JWT_REFRESH_EXPIRES. Prefers the token's own `exp` claim (seconds since
 * epoch) so the DB row and the JWT can never drift apart; falls back to parsing
 * the configured duration if the claim is absent.
 */
export function refreshTokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (decoded?.exp) {
    return new Date(decoded.exp * 1000);
  }
  return new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES));
}

/**
 * Parse a compact duration string (e.g. "15m", "7d", "3600") into milliseconds.
 * Mirrors the subset of formats accepted by jsonwebtoken's `expiresIn`.
 */
function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    // Unknown format — default to 7 days rather than throwing at runtime.
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2] ?? "ms";
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}
