import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import type { ProviderName } from "../../config/oauth";

/**
 * Stateless CSRF `state` for the OAuth flow.
 *
 * Rather than persist state server-side, we encode a small payload
 * (`provider`, a random nonce, and an issue timestamp) and append an HMAC over
 * it keyed by OAUTH_STATE_SECRET. On callback we recompute the HMAC to prove the
 * value originated from us, check it hasn't expired, and check the provider
 * matches. This gives CSRF protection with no shared storage between the
 * initiation and callback requests.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 */

/** How long a `state` value remains valid after issuance. */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StatePayload {
  /** Provider the flow was initiated for. */
  p: ProviderName;
  /** Random nonce — makes each state unguessable and unique. */
  n: string;
  /** Issued-at, ms since epoch. */
  t: number;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(payloadB64: string): string {
  return base64url(
    createHmac("sha256", env.OAUTH_STATE_SECRET).update(payloadB64).digest()
  );
}

/** Create a signed `state` value for the given provider. */
export function createState(provider: ProviderName): string {
  const payload: StatePayload = {
    p: provider,
    n: randomBytes(16).toString("hex"),
    t: Date.now(),
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a `state` value: constant-time signature check, TTL check, and that it
 * was issued for the expected provider. Returns true only if all pass.
 */
export function verifyState(state: string, provider: ProviderName): boolean {
  if (typeof state !== "string" || !state.includes(".")) return false;

  const [payloadB64, signatureB64] = state.split(".");
  if (!payloadB64 || !signatureB64) return false;

  // Recompute the signature and compare in constant time.
  const expected = Buffer.from(sign(payloadB64));
  const actual = Buffer.from(signatureB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as StatePayload;
  } catch {
    return false;
  }

  if (payload.p !== provider) return false;
  if (typeof payload.t !== "number") return false;
  if (Date.now() - payload.t > STATE_TTL_MS) return false;

  return true;
}
