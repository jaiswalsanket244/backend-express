# Fullstack MERN Interview Question — ~2 Years of Experience

> **Stack:** MongoDB · Express · React · Node.js
> **Target level:** Mid-level candidate with roughly 2 years of hands-on MERN experience
> **Format:** One primary scenario question with guided follow-ups
> **Suggested time:** 35–45 minutes (discussion, not a live-coding marathon)

---

## The Question

> You are building a **"Save for later" (bookmarks)** feature for an e-commerce app.
> A logged-in user can bookmark any product, view their list of bookmarks, and remove
> a bookmark. Bookmarks are private to each user.
>
> Walk me through how you would design and implement this end to end in a MERN stack.
> Cover the **data model**, the **Express API**, the **React UI**, and how the pieces
> talk to each other. As you go, call out the decisions you would make around
> **authentication, validation, and performance**, and where things could go wrong.

This is deliberately open-ended. A 2-YOE candidate should be able to structure a real
feature rather than just recite definitions. Let them lead; use the follow-ups below to
probe depth where they stay shallow.

---

## What This Evaluates

| Area | Signal you're looking for |
|------|---------------------------|
| **Data modeling (MongoDB)** | Chooses a sensible schema; understands referencing vs. embedding; adds indexes; prevents duplicate bookmarks. |
| **API design (Express)** | RESTful routes, correct status codes, auth middleware, input validation, error handling. |
| **Frontend (React)** | Component/state breakdown, data fetching, loading/error states, optimistic updates. |
| **Integration & auth** | How the JWT/session flows from client to server; how the server scopes data to the current user. |
| **Engineering judgment** | Trade-offs, edge cases, security, and "what breaks in production." |

---

## Model Answer

A strong candidate covers most of the following. They do **not** need every detail — the
goal is coherent reasoning across the whole stack.

### 1. Data model (MongoDB / Mongoose)

Prefer a **reference-based** design with a dedicated `Bookmark` collection rather than
embedding an ever-growing array inside the `User` document (unbounded arrays hurt
document size and updates).

```js
// models/Bookmark.js
const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  },
  { timestamps: true }
);

// A user can bookmark a given product at most once.
bookmarkSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
```

Key points a good answer surfaces:
- **Compound unique index** on `{ user, product }` to enforce "no duplicate bookmarks" at
  the database level (not just in application code).
- Index also makes "list my bookmarks" queries efficient (`find({ user })`).
- `timestamps` gives free `createdAt` for sorting the list newest-first.

### 2. Express API

```js
// routes/bookmarks.js
const router = require("express").Router();
const Bookmark = require("../models/Bookmark");
const auth = require("../middleware/auth"); // verifies JWT, sets req.userId

// List the current user's bookmarks
router.get("/", auth, async (req, res, next) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.userId })
      .populate("product", "name price imageUrl")
      .sort({ createdAt: -1 });
    res.json(bookmarks);
  } catch (err) {
    next(err);
  }
});

// Add a bookmark
router.post("/", auth, async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId is required" });

    const bookmark = await Bookmark.create({ user: req.userId, product: productId });
    res.status(201).json(bookmark);
  } catch (err) {
    // Duplicate key -> already bookmarked. Treat as idempotent success or 409.
    if (err.code === 11000) return res.status(409).json({ error: "Already bookmarked" });
    next(err);
  }
});

// Remove a bookmark
router.delete("/:productId", auth, async (req, res, next) => {
  try {
    const result = await Bookmark.findOneAndDelete({
      user: req.userId,
      product: req.params.productId,
    });
    if (!result) return res.status(404).json({ error: "Bookmark not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

Key points:
- Every route is behind `auth`, and every query is **scoped by `req.userId`** — a user can
  never read or delete another user's bookmarks. This is the single most important security
  point in the question.
- Correct status codes: `201` create, `204` delete, `400` bad input, `409` duplicate,
  `404` missing.
- The unique index turns a race condition (double-click / double-request) into a clean
  `11000` error instead of two rows.
- Errors are forwarded to a central error-handling middleware (`next(err)`), not swallowed.

### 3. React UI

Break it into a small, testable set of pieces:
- A `BookmarkButton` on the product card/detail page (toggles state).
- A `BookmarksPage` that lists saved products.
- A data layer (fetch/axios wrapper or a hook like `useBookmarks`) that centralizes calls.

```jsx
function BookmarkButton({ productId, initiallyBookmarked }) {
  const [bookmarked, setBookmarked] = useState(initiallyBookmarked);
  const [pending, setPending] = useState(false);

  async function toggle() {
    // Optimistic update: flip UI immediately, roll back on failure.
    const next = !bookmarked;
    setBookmarked(next);
    setPending(true);
    try {
      if (next) {
        await api.post("/bookmarks", { productId });
      } else {
        await api.delete(`/bookmarks/${productId}`);
      }
    } catch (err) {
      setBookmarked(!next); // roll back
      // surface a toast / error message
    } finally {
      setPending(false);
    }
  }

  return (
    <button onClick={toggle} disabled={pending} aria-pressed={bookmarked}>
      {bookmarked ? "★ Saved" : "☆ Save"}
    </button>
  );
}
```

Key points:
- **Optimistic UI** with rollback — a 2-YOE candidate should at least mention it, even if
  they'd start with a simpler "await then update" version.
- Explicit **loading and error states**; disable the button while a request is in flight to
  avoid double submits.
- The auth token is attached centrally (axios interceptor / fetch wrapper), not per call.
- Accessibility nicety: `aria-pressed` on a toggle button.

### 4. How the pieces connect

1. On login, the server issues a **JWT**; the client stores it (httpOnly cookie is safer
   than `localStorage`; expect the candidate to at least know the trade-off).
2. Each API request sends the token; `auth` middleware verifies it and sets `req.userId`.
3. The server uses `req.userId` to scope every query — never trusts a user id sent from the
   client body.

---

## Follow-up Questions (probe depth)

1. **"Why a separate collection instead of a `bookmarks: [productId]` array on the user?"**
   → Unbounded array growth, document size limits (16 MB), harder pagination, contention on
   the single user document. Referencing scales better here.

2. **"A user double-clicks the Save button. What happens on the backend?"**
   → Two POSTs race; the unique index means the second insert fails with `11000`, which we
   handle as 409 / idempotent. Without the index you'd get duplicate rows.

3. **"How do you keep users from seeing each other's bookmarks?"**
   → Always derive the owner from the verified token (`req.userId`), never from request
   input. Every query is filtered by that id.

4. **"The bookmarks list is slow for power users with thousands of saves. What do you do?"**
   → Pagination (limit/skip or cursor-based), rely on the `{ user, createdAt }` index,
   `populate` only the fields you render, consider caching.

5. **"Where would you store the JWT on the client, and why?"**
   → httpOnly, Secure, SameSite cookie mitigates XSS token theft; `localStorage` is simpler
   but exposed to XSS. Discuss CSRF trade-offs with cookies.

6. **"How would you test this feature?"**
   → Unit tests for the model/validation, integration tests for the routes (supertest),
   and a component test for the button's optimistic + rollback behavior.

---

## Evaluation Rubric

| Level | What it looks like |
|-------|--------------------|
| **Below bar** | Only defines what MERN letters stand for; no schema; forgets to scope queries to the user; no error handling. |
| **At bar (target for ~2 YOE)** | Reasonable schema with an index, auth-protected CRUD routes with correct status codes, a React component with loading/error states, and correctly scopes data to the logged-in user. Handles the duplicate-bookmark case when prompted. |
| **Above bar** | Volunteers the unique-index race-condition insight, optimistic UI with rollback, pagination/performance thinking, JWT storage trade-offs, and a testing strategy — without heavy prompting. |

---

## Interviewer Notes

- Keep it a **conversation**. If the candidate stalls on one layer, move them to another —
  you want a read on the whole stack, not a single sticking point.
- Don't penalize different-but-valid choices (e.g., cursor pagination vs. offset, cookie vs.
  header auth) as long as they can justify the trade-off.
- The strongest signal at this level is **scoping data to the authenticated user** and
  **handling the obvious edge cases** (duplicates, missing records, in-flight requests).
