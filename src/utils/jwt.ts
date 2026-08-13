import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Claims carried by our JWTs. `sub` is the user id; extra fields may be added later.
 */
export interface TokenPayload {
  sub: string;
  email?: string;
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
