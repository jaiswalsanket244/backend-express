import express, { NextFunction, Request, Response, Router } from "express";
import { ZodError } from "zod";
import * as authService from "../services/auth.service";
import * as oauthService from "../services/oauth/oauth.service";
import { requireAuth } from "../middleware/requireAuth";
import { HttpError } from "../utils/httpError";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "../validation/auth.schemas";

/**
 * Auth router mounted at /api/auth.
 *
 * Handlers are intentionally thin: they validate input, delegate to the auth
 * service, and shape the HTTP response. All business logic lives in the service
 * layer (`src/services/auth.service.ts`).
 */
export const authRouter = Router();

/**
 * Wrap an async handler so thrown errors are forwarded to Express' error
 * pipeline (and our `handleError` helper) instead of crashing the process.
 */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** Translate a service/validation error into a JSON `{ error }` response. */
function handleError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
}

// POST /api/auth/register -> 201 { user, accessToken, refreshToken }
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const result = await authService.register(input);
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res);
    }
  })
);

// POST /api/auth/login -> 200 { user, accessToken, refreshToken }
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(input);
      res.status(200).json(result);
    } catch (err) {
      handleError(err, res);
    }
  })
);

// POST /api/auth/refresh -> 200 { accessToken, refreshToken } (rotates)
authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const tokens = await authService.refresh(refreshToken);
      res.status(200).json(tokens);
    } catch (err) {
      handleError(err, res);
    }
  })
);

// POST /api/auth/logout -> 204 (revokes the refresh token; idempotent)
authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    try {
      const { refreshToken } = logoutSchema.parse(req.body);
      await authService.logout(refreshToken);
      res.status(204).send();
    } catch (err) {
      handleError(err, res);
    }
  })
);

// GET /api/auth/me -> 200 { user } (requires a valid Bearer access token)
authRouter.get(
  "/me",
  requireAuth,
  (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
  }
);

// ── OAuth (Google / Microsoft / Apple) ──────────────────────────────────────
//
// GET /api/auth/oauth/:provider
//   Begin sign-in. Unknown provider -> 400; unconfigured (placeholder creds) ->
//   503 { error: "<provider> OAuth is not configured" }; otherwise 302 redirect
//   to the provider's authorize endpoint with a signed CSRF `state`.
authRouter.get("/oauth/:provider", (req: Request, res: Response) => {
  try {
    const url = oauthService.startOAuth(req.params.provider);
    res.redirect(302, url);
  } catch (err) {
    handleError(err, res);
  }
});

// GET|POST /api/auth/oauth/:provider/callback
//   Provider redirect back. Google/Microsoft arrive as a GET query redirect;
//   Apple uses POST form_post (hence the urlencoded body parser + POST route).
//   On success -> 302 to `${FRONTEND_URL}/auth/callback#accessToken=...&refreshToken=...`.
//   On any failure -> 302 to `${FRONTEND_URL}/login?error=<reason>`.
async function oauthCallback(req: Request, res: Response): Promise<void> {
  const source = (req.method === "POST" ? req.body : req.query) as Record<
    string,
    unknown
  >;
  const input: oauthService.CallbackInput = {
    code: typeof source.code === "string" ? source.code : undefined,
    state: typeof source.state === "string" ? source.state : undefined,
    error: typeof source.error === "string" ? source.error : undefined,
    userJson: typeof source.user === "string" ? source.user : undefined,
  };
  try {
    const tokens = await oauthService.handleCallback(req.params.provider, input);
    res.redirect(302, oauthService.frontendSuccessUrl(tokens));
  } catch (err) {
    res.redirect(302, oauthService.frontendErrorUrl(err));
  }
}

authRouter.get("/oauth/:provider/callback", asyncHandler(oauthCallback));
authRouter.post(
  "/oauth/:provider/callback",
  express.urlencoded({ extended: false }),
  asyncHandler(oauthCallback)
);
