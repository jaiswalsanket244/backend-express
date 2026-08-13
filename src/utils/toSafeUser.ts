import type { User } from "@prisma/client";

/**
 * The public shape of a user returned by every auth endpoint.
 * Deliberately omits sensitive/internal fields (notably `passwordHash`).
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  createdAt: Date;
}

/**
 * Project a full User row down to its safe, serializable public shape.
 * This is the single choke point that guarantees `passwordHash` is never
 * leaked to a client.
 */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    createdAt: user.createdAt,
  };
}
