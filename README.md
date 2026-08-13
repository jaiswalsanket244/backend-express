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
| GET    | `/api/auth/me`                      | stub (501, next sub-issue) |
| GET    | `/api/auth/oauth/:provider`         | stub (501, later sub-issue) |
| GET    | `/api/auth/oauth/:provider/callback`| stub (501, later sub-issue) |

User JSON returned to clients: `{ id, email, name, provider, createdAt }` — never `passwordHash`.

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
