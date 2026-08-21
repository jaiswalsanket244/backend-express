# Fullstack MERN Interview Question — ~2 Years of Experience

> **Stack:** MongoDB · Express · React · Node.js
> **Target level:** Mid-level candidate with roughly 2 years of hands-on MERN experience
> **Format:** One primary scenario question with guided follow-ups
> **Suggested time:** 35–45 minutes (discussion, not a live-coding marathon)

---

## The Question

> You are building a **product search** page for an e-commerce app.
> A shopper types into a search box and can also filter by **category** and **price range**,
> and sort by price or newest. Results are **paginated** (say, 20 per page). The catalog has
> hundreds of thousands of products.
>
> Walk me through how you would design and implement this end to end in a MERN stack.
> Cover the **data model and indexes**, the **Express search API**, and the **React UI**
> (search box, filters, pagination). As you go, call out the decisions you would make around
> **query performance, validation, and user experience**, and where things could go wrong.

This is deliberately open-ended. A 2-YOE candidate should be able to structure a real
feature rather than just recite definitions. Let them lead; use the follow-ups below to
probe depth where they stay shallow.

---

## What This Evaluates

| Area | Signal you're looking for |
|------|---------------------------|
| **Data modeling & indexing (MongoDB)** | Sensible product schema; text or compound indexes to back search/filter/sort; understands why unindexed queries don't scale. |
| **API design (Express)** | Clean query-param contract, input validation/clamping, correct pagination, error handling. |
| **Frontend (React)** | Debounced input, filter/sort state, loading/empty/error states, URL-synced state, no race conditions. |
| **Performance judgment** | Avoids `skip` on deep pages, projects only needed fields, knows when to reach for a real search engine. |
| **Engineering judgment** | Trade-offs, edge cases (empty results, bad input), and "what breaks at scale." |

---

## Model Answer

A strong candidate covers most of the following. They do **not** need every detail — the
goal is coherent reasoning across the whole stack.

### 1. Data model & indexes (MongoDB / Mongoose)

```js
// models/Product.js
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// Full-text search over name + description.
productSchema.index({ name: "text", description: "text" });

// Back the common "filter by category, sort by price" access pattern.
productSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model("Product", productSchema);
```

Key points a good answer surfaces:
- Search needs an **index** — either a `text` index (simple, built-in) or a compound index
  that matches the filter/sort pattern. An unindexed `$regex` scan over hundreds of
  thousands of docs is the classic wrong answer.
- A **compound index** like `{ category, price }` serves "filter by category, sort by price"
  from the index instead of an in-memory sort.
- Acknowledge the limits of Mongo text search (no typo tolerance, weak relevance) and that a
  dedicated engine (Atlas Search / Elasticsearch) is the next step if search quality matters.

### 2. Express API

```js
// routes/products.js
const router = require("express").Router();
const Product = require("../models/Product");

// GET /products?q=&category=&minPrice=&maxPrice=&sort=&page=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { q, category, minPrice, maxPrice, sort } = req.query;

    // Clamp pagination so a client can't request page size 1e9.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = {};
    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sortMap = {
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      newest: { createdAt: -1 },
    };
    const sortBy = sortMap[sort] || { createdAt: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select("name price category createdAt")
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

Key points:
- **Validate and clamp** every query param. `page`/`limit` are parsed and bounded so a client
  can't ask for a million rows; price bounds are coerced to numbers.
- **Projection** (`.select(...)`) returns only the fields the list renders — smaller payloads,
  faster queries.
- Response includes pagination metadata (`total`, `totalPages`) so the UI can render controls.
- Errors forwarded to central error middleware (`next(err)`), not swallowed.
- The candidate should note `skip`/`limit` is fine for early pages but **degrades on deep
  pages** (Mongo still walks the skipped docs) — cursor/range pagination on an indexed field
  is the scalable fix.

### 3. React UI

Break it into a small, testable set of pieces:
- A `SearchBar` (debounced text input).
- `Filters` (category select, price range, sort dropdown).
- A `ProductList` with loading/empty/error states and pagination controls.
- A `useProductSearch` hook that centralizes the fetch and keeps state in sync.

```jsx
function useProductSearch({ q, category, sort, page }) {
  const [data, setData] = useState({ items: [], totalPages: 1 });
  const [status, setStatus] = useState("idle"); // idle | loading | error

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);
    params.set("page", page);

    api
      .get(`/products?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        setData(res.data);
        setStatus("idle");
      })
      .catch((err) => {
        if (err.name !== "CanceledError") setStatus("error");
      });

    // Cancel the in-flight request when inputs change — avoids race conditions
    // where a slow older response overwrites a newer one.
    return () => controller.abort();
  }, [q, category, sort, page]);

  return { data, status };
}
```

Key points:
- **Debounce** the search input (e.g. ~300 ms) so you fire one request per pause, not per
  keystroke.
- **Cancel stale requests** (`AbortController`) so an older, slower response can't overwrite a
  newer one — a subtle bug 2-YOE candidates often miss.
- Explicit **loading / empty / error** states; "no results" is a real state, not a blank page.
- Reset to `page = 1` whenever the query or filters change.
- Bonus: **sync state to the URL** (query string) so searches are shareable and the back
  button works.

### 4. How the pieces connect

1. The React hook serializes search/filter/sort/page into a query string.
2. Express parses and **validates** those params, builds a Mongo filter + sort, and runs an
   **indexed** query with projection and pagination.
3. The response carries both the page of items and pagination metadata the UI needs.
4. Cancellation on the client plus clamping on the server keep the interaction fast and safe
   under rapid typing and hostile input.

---

## Follow-up Questions (probe depth)

1. **"Why not just use `$regex` for the search box?"**
   → An unanchored `$regex` can't use an index and scans the whole collection; it doesn't
   scale to hundreds of thousands of docs. A `text` index (or a search engine) is the fix.

2. **"Page 5,000 loads slowly. Why, and what do you do?"**
   → `skip` still has to walk all skipped documents, so deep offsets get slow. Switch to
   **range/cursor pagination** on an indexed, sortable field (e.g. `_id` or `createdAt`).

3. **"A user holds down a key and types fast. What happens to your requests?"**
   → Without debounce you fire a request per keystroke; without cancellation an older
   response can land after a newer one and show stale results. Debounce + `AbortController`.

4. **"How do you keep a malicious client from asking for `limit=1000000`?"**
   → Never trust client input: parse and **clamp** `limit`/`page` server-side, and validate
   numeric ranges before building the query.

5. **"The team now wants typo tolerance and relevance ranking. Now what?"**
   → Mongo text search is limited; move to **Atlas Search / Elasticsearch** for fuzzy
   matching, synonyms, and tunable relevance, keeping Mongo as the system of record.

6. **"How would you test this feature?"**
   → Integration tests for the route (filter/sort/pagination combinations, bad input),
   a unit test for the query-building logic, and a component test for the debounced search +
   loading/empty/error states.

---

## Evaluation Rubric

| Level | What it looks like |
|-------|--------------------|
| **Below bar** | Reaches for an unindexed `$regex` scan; no pagination or unbounded `limit`; no input validation; fires a request per keystroke with no loading/empty state. |
| **At bar (target for ~2 YOE)** | Indexed search/filter, a clean query-param API with clamped pagination and metadata, and a React UI with debounced input plus loading/empty/error states. Handles bad input when prompted. |
| **Above bar** | Volunteers the `skip` deep-pagination problem and cursor alternative, cancels stale requests to avoid races, syncs state to the URL, and knows when to graduate to a dedicated search engine — without heavy prompting. |

---

## Interviewer Notes

- Keep it a **conversation**. If the candidate stalls on one layer, move them to another —
  you want a read on the whole stack, not a single sticking point.
- Don't penalize different-but-valid choices (e.g., text index vs. compound index, offset vs.
  cursor pagination) as long as they can justify the trade-off.
- The strongest signals at this level are **backing the query with an index**, **validating
  and clamping pagination**, and **handling the fast-typing race** (debounce + cancellation).
