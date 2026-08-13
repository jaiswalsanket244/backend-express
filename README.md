# backend-express

Express + TypeScript + Prisma backend for the authentication module
(auth-as-a-service). This sub-issue scaffolds the foundation: project setup,
database, `User`/`RefreshToken` models, JWT utilities, centralized config, and a
health endpoint. Auth business logic is implemented in later sub-issues.

## Tech stack

- TypeScript + Express 4
- Prisma ORM with SQLite (`file:./dev.db`) — self-contained, no external DB
- `ts-node-dev` for dev, `tsc` for builds
- `jsonwebtoken`, `bcryptjs`, `zod`, `cors`, `dotenv`

## API contract

- Server runs on `PORT` (default `4000`). API prefix: `/api/auth`.
- CORS enabled for `FRONTEND_URL` (default `http://localhost:3000`), credentials allowed.

| Method | Path                                | Status                     |
| ------ | ----------------------------------- | -------------------------- |
| GET    | `/health`                           | implemented (`{status:"ok"}`) |
| POST   | `/api/auth/register`                | stub (501, next sub-issue) |
| POST   | `/api/auth/login`                   | stub (501, next sub-issue) |
| POST   | `/api/auth/refresh`                 | stub (501, next sub-issue) |
| POST   | `/api/auth/logout`                  | stub (501, next sub-issue) |
| GET    | `/api/auth/me`                      | implemented (Bearer access token) |
| GET    | `/api/auth/oauth/:provider`         | implemented (302 / 400 / 503) |
| GET    | `/api/auth/oauth/:provider/callback`| implemented (query — Google/Microsoft) |
| POST   | `/api/auth/oauth/:provider/callback`| implemented (form_post — Apple) |

User JSON returned to clients: `{ id, email, name, provider, createdAt }` — never `passwordHash`.

## OAuth setup (Google / Microsoft / Apple)

Sign-in with Google, Microsoft, and Apple is fully wired but ships with **empty
placeholder credentials**. A provider is only "configured" when its credentials
below are non-empty (and not obvious placeholders). Until you fill them in:

- `GET /api/auth/oauth/:provider` returns **503** `{ error: "<provider> OAuth is not configured" }`.
- Unknown providers return **400**.

The app boots and builds fine without any real credentials — nothing crashes.

### Flow

1. Frontend sends the browser to `GET /api/auth/oauth/:provider`.
2. We **302-redirect** to the provider's authorize endpoint with a signed CSRF
   `state` (HMAC over `OAUTH_STATE_SECRET`, 10-min TTL). Apple additionally uses
   `response_mode=form_post`.
3. The provider redirects back to the callback (query for Google/Microsoft, a
   `POST` form body for Apple). We validate `state`, exchange the code for
   tokens, read the profile from the `id_token`, then **upsert/link** the user by
   email and issue the **same** app access + refresh tokens as the custom flow.
4. On success we **302-redirect** to the frontend:

   ```
   ${FRONTEND_URL}/auth/callback#accessToken=<jwt>&refreshToken=<jwt>
   ```

   Tokens are in the URL **fragment** (`#…`) on purpose: the fragment is never
   sent to a server or written to access logs. The frontend reads
   `window.location.hash`, stores the tokens, and clears the hash.

   On **any** failure we redirect to `${FRONTEND_URL}/login?error=<reason>`.

### Account linking policy

Users are matched by email. A brand-new email creates an OAuth user
(`passwordHash=null`). An existing email is linked — for a password-bearing local
account we record `providerId` but keep `provider="local"`; a pre-existing
OAuth-only account adopts the new provider.

### Environment variables to fill in later

Copy `.env.example` → `.env` and set the ones you need. `OAUTH_STATE_SECRET`
already has a dev default (use a long random value in production).

| Provider  | Variables |
| --------- | --------- |
| Google    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`, `MICROSOFT_TENANT` (default `common`) |
| Apple     | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CALLBACK_URL` |

### Callback URLs to register with each provider

Register these redirect URIs in each provider's console (adjust host/port for
your deployment):

- Google — `http://localhost:4000/api/auth/oauth/google/callback`
- Microsoft — `http://localhost:4000/api/auth/oauth/microsoft/callback`
- Apple — `http://localhost:4000/api/auth/oauth/apple/callback` (form_post)

> Apple's client secret is an ES256 JWT signed from `APPLE_PRIVATE_KEY` at
> token-exchange time; the code path compiles and runs, but completing a real
> Apple sign-in requires a valid key.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Generate the Prisma client
npm run prisma:generate

# 4. Create the SQLite database from the schema
npm run db:push

# 5. Run the dev server (http://localhost:4000)
npm run dev
```

## Scripts

| Script                    | Description                              |
| ------------------------- | ---------------------------------------- |
| `npm run dev`             | Start the dev server with hot reload     |
| `npm run build`           | Compile TypeScript to `dist/`            |
| `npm start`               | Run the compiled server                  |
| `npm run prisma:generate` | Generate the Prisma client               |
| `npm run prisma:migrate`  | Create/apply a dev migration             |
| `npm run db:push`         | Push the schema to the SQLite database   |

## Verify

```bash
npm run build
npm start          # logs: Server listening on port 4000
curl -s localhost:4000/health   # -> {"status":"ok"}
```
