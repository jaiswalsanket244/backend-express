import express, {
  Application,
  NextFunction,
  Request,
  Response,
} from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";

/**
 * Build and configure the Express application.
 * Kept separate from server startup so it can be imported in tests.
 */
export function createApp(): Application {
  const app = express();

  // Parse JSON request bodies.
  app.use(express.json());

  // Allow the frontend origin with credentials (cookies/authorization headers).
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );

  // Health check.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Auth routes.
  app.use("/api/auth", authRouter);

  // 404 for unmatched routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Central error handler. Must have 4 args for Express to treat it as such.
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      // eslint-disable-next-line no-console
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Internal Server Error";
      res.status(500).json({ error: message });
    }
  );

  return app;
}
