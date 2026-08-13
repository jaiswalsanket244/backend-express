import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/httpError";
import { toSafeUser, type SafeUser } from "../utils/toSafeUser";
import {
  hashToken,
  newTokenId,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import type {
  LoginInput,
  RegisterInput,
} from "../validation/auth.schemas";

/** Cost factor for bcrypt hashing (>= 10 as required). */
const BCRYPT_ROUNDS = 12;

/** The token pair issued to a client on register/login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: SafeUser;
}

/**
 * Issue a fresh access + refresh token pair for a user and persist the refresh
 * token's hash (never the raw token) so it can later be rotated or revoked.
 */
async function issueTokens(user: User): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  const jti = newTokenId();
  const refreshToken = signRefreshToken({
    sub: user.id,
    email: user.email,
    jti,
  });

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshTokenExpiry(refreshToken),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Register a new local (email/password) user, then issue tokens.
 * Rejects a duplicate email with 409.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new HttpError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name ?? null,
      passwordHash,
      provider: "local",
    },
  });

  const tokens = await issueTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

/**
 * Authenticate a local user by email + password, then issue tokens.
 * Any failure returns a generic 401 that does not reveal whether the email or
 * the password was wrong.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const invalidCredentials = new HttpError(401, "Invalid email or password");

  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });
  // Reject users without a local password (e.g. OAuth-only) the same way as a
  // missing user, so the response cannot be used to enumerate accounts.
  if (!user || !user.passwordHash) {
    throw invalidCredentials;
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw invalidCredentials;
  }

  const tokens = await issueTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

/**
 * Rotate a refresh token: verify its signature/expiry AND that its hash still
 * exists (not revoked) in the DB, then delete the old row and issue a new pair.
 * Reuse of a revoked/unknown token returns 401.
 */
export async function refresh(rawRefreshToken: string): Promise<TokenPair> {
  const invalidToken = new HttpError(401, "Invalid or expired refresh token");

  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw invalidToken;
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });
  // Unknown/already-rotated token → treat as reuse and reject.
  if (!stored) {
    throw invalidToken;
  }

  // Defense in depth: an expired DB row should also be rejected and cleaned up.
  if (stored.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
    throw invalidToken;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw invalidToken;
  }

  // Rotate: invalidate the old token, then mint a fresh pair.
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  return issueTokens(user);
}

/**
 * Revoke a refresh token by deleting its row. Idempotent: succeeds even if the
 * token is unknown/already revoked, and never reveals validity of the token.
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

/**
 * Load a user by id and return its safe shape, or throw 401 if absent.
 */
export async function getUserById(id: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(401, "Invalid or expired token");
  }
  return toSafeUser(user);
}
