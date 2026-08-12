# Todo Express API

A small, dependency-light **Express.js REST API** for a Todo application. Data is
persisted to a **JSON file on disk** (`data/todos.json`) — no external database.
It provides full CRUD plus a partial-update endpoint so a frontend can move todos
between columns via drag-and-drop (by changing `status` and `order`).

## Requirements

- Node.js >= 18 (uses `crypto.randomUUID` and `fs/promises`)

## Install

```bash
npm install
```

## Run

```bash
# Production-style start
npm start

# Development with auto-reload (nodemon)
npm run dev
```

The server listens on **http://localhost:4000** by default.

### Configuration (environment variables)

| Variable      | Default                 | Description                                |
| ------------- | ----------------------- | ------------------------------------------ |
| `PORT`        | `4000`                  | Port the server listens on                 |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin (the frontend origin)  |

Example:

```bash
PORT=4055 npm start
```

## Data storage

- Todos are stored in `data/todos.json`.
- The file (and `data/` directory) is **auto-created** with an empty array `[]`
  if it does not exist.
- Every mutation is a serialized read-modify-write, so data is durable across
  restarts and safe for a single-user local app.
- `data/todos.json` is gitignored; a sample `data/todos.seed.json` is committed
  as a reference/seed. To start from the seed, copy it:

  ```bash
  cp data/todos.seed.json data/todos.json
  ```

## Todo shape

```jsonc
{
  "id": "string (uuid)",
  "title": "string",
  "description": "string (optional, defaults to \"\")",
  "status": "todo | in-progress | done",
  "order": 0,
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

## API contract

Base path: `/api`. All request/response bodies are JSON.

### `GET /api/health`

Health check.

- **200** `{ "status": "ok" }`

### `GET /api/todos`

Returns all todos, sorted by `status` (`todo`, then `in-progress`, then `done`)
and then by `order` ascending.

- **200** `Todo[]`

```bash
curl http://localhost:4000/api/todos
```

### `POST /api/todos`

Create a todo. The server assigns `id`, `order` (appended to the end of its
status column), `createdAt`, and `updatedAt`.

Body:

```jsonc
{
  "title": "string (required, non-empty)",
  "description": "string (optional)",
  "status": "todo | in-progress | done (optional, defaults to \"todo\")"
}
```

- **201** the created `Todo`
- **400** `{ "error": string }` — missing/empty `title` or invalid `status`

```bash
curl -X POST http://localhost:4000/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"First task","description":"do it"}'
```

Response:

```json
{
  "id": "a2c94490-5562-4b9e-8bb9-b4ac2ce4c173",
  "title": "First task",
  "description": "do it",
  "status": "todo",
  "order": 0,
  "createdAt": "2026-08-12T12:59:45.854Z",
  "updatedAt": "2026-08-12T12:59:45.854Z"
}
```

### `GET /api/todos/:id`

- **200** the `Todo`
- **404** `{ "error": "Todo not found" }`

### `PATCH /api/todos/:id`

Partial update of any of `title`, `description`, `status`, `order`. `updatedAt`
is refreshed; `id` and `createdAt` are immutable. This is the endpoint the
frontend uses for drag-and-drop (change `status` and/or `order`).

Body (all fields optional):

```jsonc
{
  "title": "string (non-empty)",
  "description": "string",
  "status": "todo | in-progress | done",
  "order": 0
}
```

- **200** the updated `Todo`
- **400** `{ "error": string }` — invalid `status`, empty `title`, or non-numeric `order`
- **404** `{ "error": "Todo not found" }`

```bash
# Move a todo to the "done" column at position 2 (drag-and-drop)
curl -X PATCH http://localhost:4000/api/todos/<id> \
  -H 'Content-Type: application/json' \
  -d '{"status":"done","order":2}'
```

### `DELETE /api/todos/:id`

- **204** No Content
- **404** `{ "error": "Todo not found" }`

```bash
curl -X DELETE http://localhost:4000/api/todos/<id>
```

## Error responses

All errors return a JSON body of the form `{ "error": string }`:

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| 400    | Missing/empty `title`, invalid `status`/`order`, bad JSON   |
| 404    | Todo id not found, or unknown route                         |
| 500    | Unexpected server error                                     |

## Project structure

```
.
├── data/
│   └── todos.seed.json     # sample data (todos.json is created at runtime)
├── src/
│   ├── server.js           # app setup, CORS, JSON parsing, error handling
│   ├── routes.js           # HTTP routes -> handlers
│   ├── todos.js            # validation + business logic
│   └── store.js            # fs/promises JSON-file persistence
├── package.json
└── README.md
```
