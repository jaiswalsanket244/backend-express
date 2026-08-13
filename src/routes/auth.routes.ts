import { Router, Request, Response } from "express";

/**
 * Auth router mounted at /api/auth.
 *
 * The route structure is reserved here per the shared API contract, but the
 * business logic is implemented in later sub-issues. Every handler currently
 * responds 501 Not Implemented so the routes are clearly wired-but-pending.
 */
export const authRouter = Router();

/** Marks a route as reserved but not yet implemented. */
function notImplemented(_req: Request, res: Response): void {
  res.status(501).json({ error: "Not Implemented" });
}

// Custom email/password auth (next sub-issue)
authRouter.post("/register", notImplemented);
authRouter.post("/login", notImplemented);
authRouter.post("/refresh", notImplemented);
authRouter.post("/logout", notImplemented);
authRouter.get("/me", notImplemented);

// OAuth (later sub-issue)
authRouter.get("/oauth/:provider", notImplemented);
authRouter.get("/oauth/:provider/callback", notImplemented);
