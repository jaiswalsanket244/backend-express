# Backend Interview Question — Senior (Express / Node.js)

> **Stack:** Node.js · Express · MongoDB (or PostgreSQL) · Redis
> **Target level:** Senior-leaning backend engineer (~4–6 years) — deeper than the
> [2-YOE MERN question](./fullstack-mern-2yoe.md); **backend only**, no frontend.
> **Format:** One realistic distributed-systems scenario with several detailed,
> escalating follow-ups.
> **Suggested time:** 45–60 minutes (design discussion + targeted code snippets)

---

## The Question

> You are building the **checkout service** for an events ticketing platform. Each event
> has a fixed number of seats. Many users try to buy the **last few tickets at the same
> time** (think: a popular concert on-sale). Your service must:
>
> 1. Let a user **reserve** one or more tickets, hold them for a short window (e.g. 10
>    minutes), and then **confirm** the purchase after payment — or release the hold if
>    they don't pay in time.
> 2. **Never oversell** an event, even under heavy concurrency across multiple Node
>    processes / instances.
> 3. Be **safe to retry**: the client (or a flaky network / load balancer) may send the
>    same "confirm purchase" request more than once, and it must charge and issue tickets
>    **exactly once**.
>
> Design the Express API and the data layer. Walk me through the endpoints, the data
> model, and — most importantly — **how you prevent overselling and double-charging under
> concurrency**. Then we'll dig into failure modes, scaling, and operability.

This is deliberately about the hard parts of backend engineering: **concurrency,
idempotency, transactions, and failure handling** — not CRUD. Let the candidate lead the
design; use the follow-ups to probe exactly where their reasoning gets thin.

---

## What This Evaluates

| Area | Signal you're looking for |
|------|---------------------------|
| **Concurrency control** | Understands race conditions on shared inventory; reaches for atomic operations, conditional updates, transactions, or locks — not read-modify-write in app code. |
| **Idempotency** | Knows *why* retries happen (timeouts, load balancers, client retries) and designs an idempotency-key mechanism so confirm/charge happens exactly once. |
| **Transactions & consistency** | Can reason about what must be atomic (decrement inventory + create order) and what the boundaries are; knows the limits of the datastore they pick. |
| **State & expiry** | Models the reserve → confirm → expire lifecycle; has a concrete plan for releasing abandoned holds (TTL, sweeper job, or lazy reconciliation). |
| **Failure handling** | Thinks about the payment provider timing out, the process crashing mid-transaction, partial failures, and how the system self-heals. |
| **Scaling & operability** | Rate limiting, hot-key contention, observability, and how the design behaves at 10× load. |

---

## Model Answer

A strong senior candidate covers most of the following. They do **not** need every line of
code — the goal is coherent reasoning about correctness under concurrency and failure.

### 1. Data model

Three core concepts: the **event** (with capacity), the **reservation/hold**, and the
**order** (confirmed purchase). A common mistake is to model only "tickets sold" — you need
explicit *held* state too.

```js
// Event: source of truth for capacity.
{
  _id,
  name,
  totalSeats: 500,
  seatsAvailable: 500,   // decremented on reserve, restored on expiry/cancel
  version: 0,            // optimistic-concurrency token (optional strategy)
}

// Reservation (a temporary hold).
{
  _id,
  eventId,
  userId,
  quantity: 2,
  status: "held" | "confirmed" | "expired" | "cancelled",
  expiresAt: ISODate,    // now + 10 minutes
  idempotencyKey,        // for the confirm step
  createdAt,
}

// Order (created only on successful confirm + payment).
{
  _id,
  reservationId,
  userId,
  eventId,
  quantity,
  amount,
  paymentRef,            // id from the payment provider
  status: "paid",
  createdAt,
}
```

Key points:
- Availability lives on the **event** as a counter (`seatsAvailable`), not derived by
  counting rows at request time (that read-then-write is exactly the race we must avoid).
- A **reservation** is the held state with an `expiresAt`; an **order** only exists after
  payment succeeds. Separating them keeps "held but unpaid" distinct from "sold."

### 2. Preventing overselling — the core of the answer

The naive version is a race:

```js
// ❌ WRONG: read-modify-write. Two concurrent requests both read 1, both proceed.
const event = await Event.findById(id);
if (event.seatsAvailable >= qty) {
  event.seatsAvailable -= qty;
  await event.save();
}
```

The fix is a **single atomic, conditional decrement** — let the database enforce the
invariant. In MongoDB:

```js
// ✅ Atomic guarded decrement. Only succeeds if enough seats remain.
const updated = await Event.findOneAndUpdate(
  { _id: eventId, seatsAvailable: { $gte: qty } },
  { $inc: { seatsAvailable: -qty } },
  { new: true }
);
if (!updated) {
  // Nobody oversold — the guard failed atomically.
  return res.status(409).json({ error: "Sold out" });
}
```

The equivalent in SQL is a guarded update (`UPDATE events SET seats = seats - $qty WHERE id
= $id AND seats >= $qty` and check the affected-row count), or `SELECT ... FOR UPDATE`
inside a transaction. Either way, **the check and the decrement are one atomic step** — the
database, not the Node process, is the arbiter.

A candidate who reaches for this pattern (atomic conditional update / compare-and-swap) is
demonstrating the key insight. Optimistic concurrency with a `version` field is an
acceptable alternative if they can explain the retry loop.

### 3. Reserve → confirm → expire lifecycle

```js
// routes/reservations.js
const router = require("express").Router();
const auth = require("../middleware/auth");

// Reserve (place a hold)
router.post("/", auth, async (req, res, next) => {
  try {
    const { eventId, quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ error: "quantity must be 1–10" });
    }

    const updated = await Event.findOneAndUpdate(
      { _id: eventId, seatsAvailable: { $gte: quantity } },
      { $inc: { seatsAvailable: -quantity } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ error: "Not enough seats" });

    const reservation = await Reservation.create({
      eventId,
      userId: req.userId,
      quantity,
      status: "held",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.status(201).json(reservation);
  } catch (err) {
    next(err);
  }
});
```

**Releasing abandoned holds** — the candidate must have a concrete plan. Options, best
discussed as trade-offs:
- **TTL + sweeper job:** a background worker periodically finds `held` reservations past
  `expiresAt`, marks them `expired`, and returns seats with an atomic `$inc`. Simple and
  observable; the reconciliation must itself be idempotent (only restore seats once).
- **Lazy expiry:** treat an expired hold as unavailable on read and reconcile on the next
  write. Avoids a cron but complicates every read path.
- **Redis TTL key** as the hold, with a keyspace-notification/expiry handler to release —
  fast, but you must handle the case where the release handler misses an event.

A good answer names the **double-release hazard**: expiry and confirm can race, so restoring
seats must be guarded (`findOneAndUpdate({ status: "held" }, { status: "expired" })` and only
restore seats if that transition actually happened).

### 4. Confirm + payment — exactly-once with idempotency keys

This is where retries bite. The client sends an **idempotency key** (a UUID it generates per
purchase attempt). The server records the outcome under that key so a retry returns the
*original* result instead of charging again.

```js
// Confirm purchase — safe to retry.
router.post("/:id/confirm", auth, async (req, res, next) => {
  const key = req.header("Idempotency-Key");
  if (!key) return res.status(400).json({ error: "Idempotency-Key header required" });

  try {
    // 1. Fast path: we've already completed this exact request.
    const existing = await IdempotencyRecord.findOne({ key, userId: req.userId });
    if (existing?.status === "completed") {
      return res.status(existing.responseStatus).json(existing.responseBody);
    }

    // 2. Claim the key atomically so concurrent retries can't both proceed.
    //    Unique index on { key, userId } turns a race into a duplicate-key error.
    try {
      await IdempotencyRecord.create({ key, userId: req.userId, status: "in_progress" });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ error: "Request already in progress" });
      }
      throw e;
    }

    // 3. Do the real work: verify the hold is still valid, charge, create the order.
    const reservation = await Reservation.findOne({
      _id: req.params.id,
      userId: req.userId,
      status: "held",
      expiresAt: { $gt: new Date() },
    });
    if (!reservation) {
      await IdempotencyRecord.deleteOne({ key, userId: req.userId }); // allow a fresh try
      return res.status(410).json({ error: "Hold expired or invalid" });
    }

    // Charge the provider — pass the SAME idempotency key downstream so the provider
    // also dedupes if we retry the charge.
    const payment = await paymentProvider.charge({
      amount: reservation.quantity * PRICE,
      idempotencyKey: key,
    });

    const order = await Order.create({
      reservationId: reservation._id,
      userId: req.userId,
      eventId: reservation.eventId,
      quantity: reservation.quantity,
      amount: payment.amount,
      paymentRef: payment.id,
      status: "paid",
    });
    reservation.status = "confirmed";
    await reservation.save();

    const body = { orderId: order._id, status: "paid" };
    await IdempotencyRecord.updateOne(
      { key, userId: req.userId },
      { status: "completed", responseStatus: 201, responseBody: body }
    );
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
});
```

Key points a strong answer surfaces:
- **Idempotency key is client-generated and unique per purchase intent.** A unique index on
  `{ key, userId }` makes concurrent retries collide instead of double-processing.
- **Propagate the same key to the payment provider.** Stripe/most providers accept an
  idempotency key precisely so a retried charge is deduped on their side too — otherwise you
  fix your DB but still double-charge the card.
- **Persist the response**, not just a flag, so a retry returns the identical result.
- The seat count was already decremented at *reserve* time, so confirm doesn't touch
  inventory — it converts a hold into an order. (If you decrement at confirm instead, the
  atomic-guard pattern moves here.)

### 5. Crash safety

Ask what happens if the process dies **between** charging the provider and writing the
order. A senior answer:
- The `in_progress` idempotency record is the recovery anchor. A reconciliation job (or the
  next retry) can query the provider by idempotency key: if the charge exists but no order
  does, complete the order; if no charge, safely restart.
- This is the classic **dual-write problem** (DB + external API can't be one atomic
  transaction). Mitigations: idempotency keys everywhere, an outbox/reconciler, and treating
  the payment provider as the source of truth for "did we charge?".

---

## Follow-up Questions (probe depth)

1. **"Two requests try to grab the last seat at the same instant. Walk me through exactly
   what happens in your design."**
   → The atomic `findOneAndUpdate` with `seatsAvailable >= qty` — one wins, the other's
   guard fails and returns 409. No app-level read-then-write. Push until they articulate
   *why* the DB operation is atomic and the naive version isn't.

2. **"The load balancer retries the confirm request after a timeout, but the first request
   actually succeeded. What does the user experience?"**
   → The idempotency record is `completed`, so the retry returns the *same* order and status
   — no second charge. Follow up: what if the retry arrives while the first is still
   `in_progress`? (Return 409 / a "still processing" response; don't start a second charge.)

3. **"Why pass an idempotency key to the payment provider too — isn't your DB record
   enough?"**
   → Your record protects *your* writes, but the charge is a separate system. If you retry
   the charge after a timeout without a key, you double-charge even though your order table
   looks clean. Dedup must extend to every non-idempotent side effect.

4. **"How do abandoned holds get released, and what's the race between expiry and confirm?"**
   → TTL/sweeper vs. lazy vs. Redis-TTL, with trade-offs. The race: a hold can expire at the
   exact moment the user confirms. Guard the state transition so seats are restored *only if*
   the reservation was actually moved `held → expired`, and confirm must re-check
   `status: "held"` under the same guarantee. Otherwise you double-restore or sell an expired
   seat.

5. **"The process crashes right after the payment provider charges the card but before you
   write the order. How do you avoid an angry customer?"**
   → Dual-write problem. Recovery via idempotency key + reconciliation against the provider;
   the provider is the source of truth for money. Look for outbox pattern / a reconciler job,
   not "wrap it in a transaction" (you can't transact across an external API).

6. **"One mega-popular event means every request hammers the same `seatsAvailable` counter.
   That single document/row is now a hot spot. What do you do?"**
   → Acknowledge write contention on one key. Options: shard the counter into N buckets and
   sum them, a queue/log-based reservation system, or admission control (waiting room). The
   point is recognizing the hot-key problem, not a perfect answer.

7. **"How do you stop a bot from reserving all 500 seats?"**
   → Rate limiting (per user/IP, e.g. Redis token bucket), per-user hold caps, quantity caps
   per request, CAPTCHA/queueing for on-sales. Ties inventory correctness to abuse control.

8. **"How would you know in production that this is working — or that you started
   overselling?"**
   → Metrics (reservation success/failure rates, hold-expiry rate, `seatsAvailable` should
   never go negative — alert if it does), structured logs with the idempotency key as a
   correlation id, tracing across the charge call, and an invariant check
   (`orders + active holds ≤ capacity`).

9. **"How do you test this?"**
   → Concurrency tests that fire N simultaneous reserves at 1 remaining seat and assert
   exactly one wins; idempotency tests that replay the same confirm and assert one order/one
   charge; expiry tests with clock control; a payment provider stub that can time out and
   fail. Integration tests with `supertest` around the routes.

---

## Evaluation Rubric

| Level | What it looks like |
|-------|--------------------|
| **Below bar** | Read-modify-write on the seat count; no idempotency; "just wrap it in a transaction" without knowing the boundaries; no plan for expiring holds or provider failures. |
| **At bar (senior)** | Atomic guarded decrement to prevent overselling; explicit reserve/confirm/expire lifecycle; idempotency keys for the confirm+charge with a unique index; a concrete hold-expiry mechanism; recognizes the dual-write problem exists. |
| **Above bar** | Volunteers propagating the idempotency key to the payment provider, the expiry-vs-confirm race and how to guard it, crash-recovery via reconciliation, hot-key contention mitigation, rate limiting, and a real observability/testing plan — with little prompting. |

---

## Interviewer Notes

- The **single highest-signal moment** is watching the candidate handle "two requests, one
  seat." If they reach for an atomic conditional update unprompted, that's a strong senior
  signal. If they write read-then-write, probe whether they can *find* the bug themselves.
- Idempotency is the second pillar. Many mid-level engineers protect their own database but
  forget the external charge — press on "what actually gets deduped."
- Reward reasoning about **failure**, not just the happy path. "What happens if X dies here?"
  separates people who've operated systems from those who've only built them.
- Datastore choice (Mongo vs. Postgres) doesn't matter as long as they can map the atomicity
  guarantees onto the tool they picked. Don't reward name-dropping "transactions" without
  knowing what the boundary actually protects.
