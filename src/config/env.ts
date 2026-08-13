import dotenv from "dotenv";

// Load variables from .env into process.env (no-op if the file is absent).
dotenv.config();

/**
 * Read an environment variable, falling back to a default when unset/empty.
 */
function get(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

/**
 * Centralized, typed access to every environment variable the auth module uses.
 * Sane defaults are provided so the app boots out of the box for local dev.
 * OAuth secrets are placeholders for now and are wired up in a later sub-issue.
 */
export const env = {
  // Core server
  PORT: parseInt(get("PORT", "4000"), 10),
  DATABASE_URL: get("DATABASE_URL", "file:./dev.db"),
  FRONTEND_URL: get("FRONTEND_URL", "http://localhost:3000"),

  // JWT
  JWT_ACCESS_SECRET: get("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: get("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
  JWT_ACCESS_EXPIRES: get("JWT_ACCESS_EXPIRES", "15m"),
  JWT_REFRESH_EXPIRES: get("JWT_REFRESH_EXPIRES", "7d"),

  // OAuth — secret used to HMAC-sign the stateless CSRF `state` parameter that
  // round-trips through the provider. Uses a dev default so the app boots, but
  // MUST be a long random value in production.
  OAUTH_STATE_SECRET: get("OAUTH_STATE_SECRET", "dev-oauth-state-secret-change-me"),

  // OAuth — Google (placeholders)
  GOOGLE_CLIENT_ID: get("GOOGLE_CLIENT_ID", ""),
  GOOGLE_CLIENT_SECRET: get("GOOGLE_CLIENT_SECRET", ""),
  GOOGLE_CALLBACK_URL: get(
    "GOOGLE_CALLBACK_URL",
    "http://localhost:4000/api/auth/oauth/google/callback"
  ),

  // OAuth — Microsoft (placeholders)
  MICROSOFT_CLIENT_ID: get("MICROSOFT_CLIENT_ID", ""),
  MICROSOFT_CLIENT_SECRET: get("MICROSOFT_CLIENT_SECRET", ""),
  MICROSOFT_CALLBACK_URL: get(
    "MICROSOFT_CALLBACK_URL",
    "http://localhost:4000/api/auth/oauth/microsoft/callback"
  ),
  MICROSOFT_TENANT: get("MICROSOFT_TENANT", "common"),

  // OAuth — Apple (placeholders)
  APPLE_CLIENT_ID: get("APPLE_CLIENT_ID", ""),
  APPLE_TEAM_ID: get("APPLE_TEAM_ID", ""),
  APPLE_KEY_ID: get("APPLE_KEY_ID", ""),
  APPLE_PRIVATE_KEY: get("APPLE_PRIVATE_KEY", ""),
  APPLE_CALLBACK_URL: get(
    "APPLE_CALLBACK_URL",
    "http://localhost:4000/api/auth/oauth/apple/callback"
  ),
} as const;

export type Env = typeof env;
