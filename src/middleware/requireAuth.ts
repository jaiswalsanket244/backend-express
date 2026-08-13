import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../utils/jwt";
import { toSafeUser, type SafeUser } from "../utils/toSafeUser";

// Augment Express' Request so downstream handlers can read `req.user` type-safely.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

/**
 * Express middleware that authenticates a request via a Bearer access token.
 * Verifies the JWT, loads the user, attaches the safe user shape to `req.user`,
 * and responds 401 on any missing/invalid/expired token or unknown user.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = toSafeUser(user);
  next();
}
