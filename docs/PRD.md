# Dhaka Tesla Pool — Product Requirements Document (PRD)

> Share a seat. Split the fare. Survive Dhaka traffic.

| | |
|---|---|
| **Version** | 1.0 (MVP) |
| **Release** | `release/v1.0.0` |
| **Stack** | Next.js · NestJS (REST) · PostgreSQL · TypeORM · Docker Compose |
| **Related docs** | [ARCHITECTURE.md](./ARCHITECTURE.md) — diagrams, concurrency · [ERD.md](./ERD.md) — full database design |

---

## 1. The problem in one paragraph

8:41 AM, Banani Road 11. Jashim has **Bullet**, a 3-seat battery "Tesla". Nusrat (Banani → Mohakhali) and Rafiq (Banani → Gulshan 1) are strangers heading the same way. Riding alone costs each of them more, and two of Bullet's seats go empty. Our app lets them **share one vehicle, pay a fair individual fare, and see only their own ride details**. Jashim sees exactly who is riding and what stage the trip is at. When Shirin tries for the last seat, the app must **never sell a seat that doesn't exist**. After every ride, we keep enough history to explain what happened.

---

## 2. Goals and non-goals

### Goals (MVP must do this)

1. A passenger can request a ride and see an estimated fare **before** confirming.
2. Compatible passengers are **automatically pooled** into one vehicle.
3. Occupied seats **never exceed** vehicle capacity, even with simultaneous requests.
4. Each passenger gets an **individual, hand-checkable fare**.
5. The driver moves the ride through clear stages: arrived → started → completed.
6. Every status or fare change is **recorded** (who, what, when).
7. The whole system runs with **`docker compose up`**.

### Non-goals (deliberately not built)

- Real maps, routing, GPS or ETAs
- Real payments (cash only, recorded but not processed)
- Driver sign-up and vehicle registration (drivers are seeded)
- Live chat, ratings, push notifications
- Per-passenger drop-off inside a pool (see §18)
- Microservices, Redis, queues, WebSockets (see ARCHITECTURE §7)

---

## 3. Users (the cast)

The cast is used identically in seed data, tests, the demo and this document.

| Person | Role | What they want | Demo trip |
|---|---|---|---|
| **Jashim** | Driver of **Bullet** (3 seats) | Know who's riding and when he can go | — |
| **Nusrat** | Passenger, running late | Get to work, fair price | Banani → Mohakhali, 1 seat |
| **Rafiq** | Passenger, stranger to Nusrat | Same route, cheaper, no small talk | Banani → Gulshan 1, 1 seat |
| **Shirin** | Passenger, arrives last | Grab the last seat | Banani → Gulshan 1, 1 seat |

---

## 4. Assumptions

The brief leaves some things open on purpose. These are our decisions. Each one is documented here and applied the same way everywhere.

| # | Assumption | Why |
|---|---|---|
| A1 | Geography is a **fixed list of 8 Dhaka zones**: Banani, Gulshan 1, Mohakhali, Dhanmondi, Mirpur, Uttara, Farmgate, Bashundhara. Distances between zones are a fixed table in code. | The brief says not to fight map APIs; fixed numbers make fares checkable by hand. |
| A2 | **Matching rule:** requests can share a pool if they have the **same pickup zone**, the driver **hasn't arrived yet**, and there are **enough free seats**. Drop-off zones may differ. | Simple, consistent, and covers Nusrat and Rafiq's "overlapping but not identical" trip. |
| A3 | Only **passengers** can sign up. Drivers and vehicles are **seeded**. | Driver onboarding isn't part of the story. |
| A4 | A passenger can have **one active ride** at a time. A driver can have **one active pool** at a time. | Prevents confusing double bookings. |
| A5 | A passenger can book **1 to 3 seats** (e.g. travelling with a friend). The fare is **per seat**. | Keeps the capacity logic meaningful. |
| A6 | The driver completes the **whole pool at once** at the end of the trip. | One lifecycle is easier to build and explain. |
| A7 | A passenger can cancel **only before the driver arrives**. No cancellation fee. | Once Jashim is waiting at the pickup, cancelling wastes his time. |
| A8 | Payment is **cash**. The fare is recorded; collection is off-app. | The brief allows cash; no gateway needed. |
| A9 | Status updates reach the browser by **refreshing every 5 seconds** (polling). | Simple and enough for a demo. |

---

## 5. Features and user stories

Each story has **acceptance criteria**. A feature is done when every one of its criteria passes.

### 5.1 Passenger

**P1. Sign up and sign in**
> As Nusrat, I want an account so my rides are mine.

- Sign up with name, email and password. Email must be unique and valid; password at least 8 characters.
- Sign in returns a login token (JWT). Wrong email or password shows one generic error ("Invalid email or password").
- Passwords are stored hashed (bcrypt), never as plain text.

**P2. See an estimated fare**
> As Nusrat, I want to know the price before I book.

- Choose pickup zone, drop-off zone and seats; the fare estimate appears before confirming.
- Pickup and drop-off can't be the same zone. Seats must be 1 to 3.
- The estimate shows the solo fare and, if a pool is available, the lower pooled fare.

**P3. Request a ride**
> As Nusrat, I want to book and get matched quickly.

- On confirm, the system first looks for a compatible open pool (rule A2).
  - **Found:** the passenger joins it immediately → status `MATCHED`.
  - **Not found:** the request waits → status `REQUESTED`, visible to online drivers.
- A passenger with an active ride cannot book another (A4).

**P4. Track my ride**
> As Nusrat, I want to know what's happening without asking anyone.

- The "My ride" page shows status as a simple progress bar: Waiting → Matched → Driver arrived → On the way → Completed.
- When matched, it shows: driver name (Jashim), vehicle (Bullet), **my own fare**, and "Shared with 1 other passenger".
- It **never** shows another passenger's name, email, fare or drop-off.

**P5. Cancel**
> As Rafiq, I want to cancel if my plans change.

- The cancel button shows only when the status is `REQUESTED` or `MATCHED`.
- Cancelling frees the seats at once. If the pool becomes empty, the pool is cancelled too.
- Trying to cancel after the driver has arrived returns an error.

**P6. Ride history**
> As Rafiq, I want to see my past rides.

- Shows my completed and cancelled rides, newest first: date, from → to, seats, fare, final status.
- With no rides, it shows an empty state ("No rides yet — book your first one").

### 5.2 Driver

**D1. Sign in and go online/offline**
> As Jashim, I want to take requests only when I'm working.

- Offline drivers see no requests and can't accept any.
- A driver **can't go offline** while he has an active pool.

**D2. See relevant requests**
> As Jashim, I want to see who needs a ride.

- Shows `REQUESTED` rides, oldest first: passenger first name, pickup → drop-off, seats, fare.
- Only requests Jashim **can actually accept** are shown:
  - no active pool → every waiting request that fits Bullet's capacity;
  - active pool still `MATCHED` → only requests with the **same pickup zone** that fit the **free** seats;
  - pool already `DRIVER_ARRIVED` or later → an empty list (nobody joins after arrival).

**D3. Accept a request**
> As Jashim, I want to take Nusrat's request.

- With no active pool: accepting **creates a new pool** for Bullet with that passenger → `MATCHED`.
- With an open pool in the same pickup zone: accepting **adds** the passenger to it.
- If the accept fails, he sees a clear message and the list refreshes:
  - request already matched or cancelled → `REQUEST_UNAVAILABLE`
  - not enough free seats → `POOL_FULL`
  - pickup zone differs from his active pool, or pool already past `MATCHED` → `POOL_NOT_JOINABLE`
  - driver is offline → `DRIVER_OFFLINE`

**D4. Move the trip forward**
> As Jashim, I want to tell everyone where the trip stands.

- Buttons appear one at a time, in order: **Arrived** → **Start trip** → **Complete trip**.
- Each button moves the pool **and every passenger in it** to the next status.
- Buttons for the wrong stage are never shown, and the API rejects them anyway.

**D5. See my passengers and history**
> As Jashim, I want to know who's in Bullet.

- "Current trip" shows each passenger: first name, drop-off zone, seats, fare (for cash collection), and a seat counter like **2 / 3 seats**.
- "History" lists past pools with passengers, total fare and completion time.

### 5.3 Pool (shared ride)

**S1.** More than one request can share one vehicle (rule A2).
**S2.** Seats taken **never** exceed capacity, even under simultaneous requests (§8).
**S3.** Every passenger has their **own fare and own status**.
**S4.** Pool membership is obvious: the driver sees the list, and each passenger sees "Shared with N other passengers".

---

## 6. Ride lifecycle

A ride request and its pool move through the same statuses.

```
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
     └──────────┴──→ CANCELLED
```

| From | To | Who can do it | Condition |
|---|---|---|---|
| — | `REQUESTED` | Passenger | No other active ride |
| `REQUESTED` | `MATCHED` | System (auto-join) or driver (accept) | Enough free seats, same pickup zone |
| `MATCHED` | `DRIVER_ARRIVED` | Driver of that pool | — |
| `DRIVER_ARRIVED` | `STARTED` | Driver of that pool | — |
| `STARTED` | `COMPLETED` | Driver of that pool | — |
| `REQUESTED` / `MATCHED` | `CANCELLED` | The passenger who owns it | Driver hasn't arrived |

- Any other move is rejected with **`409 INVALID_TRANSITION`**.
- Every accepted move writes one row into **`ride_events`**: which ride, from, to, who did it, and when. It is written in the same database transaction as the change itself, so a change and its history can never disagree.

**Why we kept the suggested lifecycle:** it matches what passengers and the driver actually see. The one change is that pool and passenger statuses move **together** (A6). Per-passenger drop-off is listed as a next improvement.

---

## 7. Fare model

### Formula

```
seatFare      = baseFare + distanceCharge − poolDiscount
passengerFare = seatFare × seats
```

| Rule | Value |
|---|---|
| `baseFare` | 40 taka |
| `distanceCharge` | distance km × 20 taka |
| `poolDiscount` | 25% of `distanceCharge`, **only if the pool has 2 or more passengers** |

**Distances used in the demo** (from the fixed zone table):

| Route | Distance |
|---|---|
| Banani → Mohakhali | 3 km |
| Banani → Gulshan 1 | 4 km |

### Check it by hand: Nusrat and Rafiq

| | Nusrat (Banani → Mohakhali) | Rafiq (Banani → Gulshan 1) |
|---|---|---|
| Base fare | 40 | 40 |
| Distance charge | 3 × 20 = 60 | 4 × 20 = 80 |
| Solo fare (no discount) | **100 taka** | **120 taka** |
| Pool discount (25% of distance) | −15 | −20 |
| **Pooled fare** | **85 taka** | **100 taka** |

- When Nusrat books alone, she sees **100 taka**. When Rafiq joins, her fare drops to **85 taka**. Both see the update.
- The **final fare** is locked when the trip **starts**, based on how many passengers are in the pool at that moment. If Rafiq cancels before Jashim arrives, Nusrat goes back to 100 taka.

### How money is stored

- All amounts are **integers in paisa**: 85 taka = `8500`, 100 taka = `10000`.
- **Why not decimals or floats?** Floats can't store money exactly (`0.1 + 0.2 = 0.30000000000000004`). Integers are exact, fast, and simple to compare in tests. We divide by 100 only when showing the amount.
- **Rounding:** the pool discount is rounded **down** to a whole paisa (`Math.floor`). This can make a fare at most 1 paisa **per seat** higher, never lower, and every fare stays a whole integer. (With the demo distances there is never a fraction.)

---

## 8. The last-seat rule (concurrency)

**Scenario:** Bullet has **1 seat left**. Nusrat and Shirin **request a ride from Banani at the same instant**. Both requests are auto-matched to Bullet's pool, and both read "1 seat free".

**Requirement:** exactly **one** gets the seat. The other gets a clear message ("This ride just filled up — we're still looking for you") and her request stays `REQUESTED`. The seat count ends at 3, never 4.

**How (MVP):** the seat check and the seat update happen in **one SQL statement**, so the database processes the two requests one after the other:

```sql
UPDATE pools SET seats_taken = seats_taken + :seats
WHERE id = :poolId AND status = 'MATCHED'
  AND seats_taken + :seats <= capacity;
-- 1 row changed = got the seat · 0 rows changed = full
```

**Safety net:** the database constraint `CHECK (seats_taken BETWEEN 0 AND capacity)` rejects any write that would overfill Bullet, even if the code has a bug.

**At larger scale:** see ARCHITECTURE §5 and the bonus section.

---

## 9. Privacy and permissions

| Data | Passenger (own ride) | Passenger (someone else's) | Driver (own pool) |
|---|---|---|---|
| Status | ✅ | ❌ | ✅ |
| Fare | ✅ | ❌ | ✅ (to collect cash) |
| Pickup / drop-off | ✅ | ❌ | ✅ |
| Name | ✅ own | ❌ | First name only |
| Email / password | ✅ own email | ❌ | ❌ |
| Number of co-riders | ✅ | — | ✅ |

Rules:
- Passengers can **only** read or cancel their **own** rides. Anything else returns **`404`** (not `403`, so the app doesn't reveal that the ride exists).
- A ride's timeline (`GET /rides/:id`) **never names another passenger**: event notes say "Another passenger joined", never "Rafiq joined".
- Drivers can only act on **their own** pool.
- Passengers can't call driver actions, and drivers can't call passenger actions (`403`).

---

## 10. Screens

A simple, clean interface. Every screen that loads data has a **loading**, **error** and **empty** state.

| Screen | Who | Main content | Empty state |
|---|---|---|---|
| `/login`, `/signup` | Everyone | Form, validation messages | — |
| `/ride/new` | Passenger | Pickup, drop-off, seats → fare estimate → Confirm | — |
| `/ride/current` | Passenger | Progress bar, driver + Bullet, my fare, co-rider count, Cancel | "No active ride — book one" |
| `/rides` | Passenger | History list | "No rides yet" |
| `/driver` | Driver | Online toggle, request list, Accept | "No requests right now" / "You're offline" |
| `/driver/trip` | Driver | Passenger list, seat counter, next-step button | "No active trip" |
| `/driver/history` | Driver | Past pools | "No trips yet" |

---

## 11. API overview (REST, prefix `/api/v1`)

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/signup` | Public | Create a passenger account |
| `POST /auth/login` | Public | Get a JWT |
| `GET /auth/me` | Logged in | Current user |
| `GET /zones` | Logged in | The 8 zones |
| `POST /rides/estimate` | Passenger | Fare estimate |
| `POST /rides` | Passenger | Request a ride (auto-join or wait) |
| `GET /rides` | Passenger | My ride history |
| `GET /rides/current` | Passenger | My active ride |
| `GET /rides/:id` | Passenger (owner) | One ride with its status, fare and timeline; `404` if not yours (demo step 7) |
| `POST /rides/:id/cancel` | Passenger (owner) | Cancel |
| `PATCH /driver/status` | Driver | Go online / offline |
| `GET /driver/requests` | Driver | Waiting requests that fit |
| `POST /driver/requests/:id/accept` | Driver | Accept → create or join pool |
| `GET /driver/pool` | Driver | Current pool and passengers |
| `POST /pools/:id/arrive` · `/start` · `/complete` | Driver (owner) | Move the trip forward |
| `GET /driver/history` | Driver | Past pools |
| `GET /health` | Public | Health check for Docker |

**Error format** (always the same shape):

```json
{ "statusCode": 409, "code": "POOL_FULL", "message": "This ride just filled up" }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad input (same zones, 0 seats…) |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Wrong role |
| `NOT_FOUND` | 404 | Doesn't exist **or isn't yours** |
| `POOL_FULL` | 409 | No seats left |
| `POOL_NOT_JOINABLE` | 409 | Pool is in another pickup zone or already past `MATCHED` |
| `REQUEST_UNAVAILABLE` | 409 | Request was already matched or cancelled |
| `DRIVER_OFFLINE` | 409 | Driver must be online to accept |
| `INVALID_TRANSITION` | 409 | Wrong lifecycle step |
| `ACTIVE_RIDE_EXISTS` | 409 | Already has an active ride or pool |
| `EMAIL_TAKEN` | 409 | Sign-up with an email that already exists |

---

## 12. History and audit

After a ride ends, we can answer "what happened?" from two tables:

- **`ride_requests`** — the final state: who, from, to, seats, fare, status.
- **`ride_events`** — the timeline: every status or fare change with who and when.

Example timeline for Nusrat:

| Time | From → To | By |
|---|---|---|
| 08:41:00 | — → REQUESTED | Nusrat |
| 08:41:20 | REQUESTED → MATCHED | Jashim (accepted) |
| 08:43:05 | Fare 100 → 85 (another passenger joined) | System |
| 08:46:10 | MATCHED → DRIVER_ARRIVED | Jashim |
| 08:47:00 | DRIVER_ARRIVED → STARTED | Jashim |
| 08:58:30 | STARTED → COMPLETED | Jashim |

Events are **never updated or deleted**; new events are only added.

**Pool cancellation:** when the last passenger cancels (P5), the pool is cancelled too. This is recorded in the note of that passenger's own `CANCELLED` event: "pool cancelled: last passenger left". There is no separate pool history table (ERD §3, `ride_events`).

---

## 13. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | bcrypt passwords · JWT with expiry · secrets only in `.env` (never committed) · CORS limited to the web app · input validated on every endpoint |
| **Data integrity** | Transactions for every multi-step change · CHECK constraints (capacity, seats) · foreign keys · unique email |
| **Performance** | Matching and booking answer in **under 1 second** for the demo load · indexes for "my rides" and "driver requests" |
| **Logging** | One log line per request: method, path, status, duration, user id · errors logged with stack trace (never passwords or tokens) |
| **Run anywhere** | `docker compose up` starts db → api (TypeORM migrations + seed) → web, with health checks |
| **Deployment** | Free tier only. If free backend hosting isn't possible, document why and rely on Docker |

---

## 14. Seed data and demo credentials

Loaded automatically on first start.

| Name | Email | Password | Role |
|---|---|---|---|
| Jashim | `jashim@teslapool.dev` | `password123` | Driver (Bullet, 3 seats) |
| Nusrat | `nusrat@teslapool.dev` | `password123` | Passenger |
| Rafiq | `rafiq@teslapool.dev` | `password123` | Passenger |
| Shirin | `shirin@teslapool.dev` | `password123` | Passenger |

These are demo-only passwords, clearly labelled in the README.

### Demo script (matches the video)

1. Jashim goes online.
2. Nusrat requests Banani → Mohakhali → sees 100 taka → `REQUESTED`.
3. Jashim accepts → pool created, **1/3 seats**.
4. Rafiq requests Banani → Gulshan 1 → **auto-joins** → **2/3 seats**. Nusrat's fare drops to 85, Rafiq's is 100.
5. Shirin requests 2 seats → only 1 left → stays `REQUESTED` (edge case).
6. Shirin cancels that request and books again with 1 seat → joins → **3/3 seats**, pool full. (There is no "edit booking" in the MVP; cancel + rebook keeps the one-active-ride rule simple.)
7. Nusrat calls `GET /rides/:id` with Rafiq's ride id → `404` (an API check, run from `docs/api/demo.http`; there is no ride-detail screen in the MVP).
8. Jashim: Arrived → Start → Complete. Everyone sees `COMPLETED`; history shows the timeline.

---

## 15. Testing requirements

Tests target the risky behaviour, not coverage numbers. The cast is used in every test.

| # | Test | Type |
|---|---|---|
| T1 | Bullet's capacity can never be exceeded (4th seat rejected) | Integration |
| T2 | Invalid transitions are rejected (e.g. `REQUESTED → COMPLETED`) | Unit |
| T3 | Nusrat pooled = 8500 paisa, Rafiq pooled = 10000 paisa, solo = 10000 / 12000 | Unit |
| T4 | Rafiq can't read or cancel Nusrat's ride (`404`); a passenger can't call driver endpoints (`403`) | Integration |
| T5 | Cancel works before arrival, fails after; cancelling frees seats | Integration |
| T6 | Nusrat and Shirin join the last seat simultaneously (`Promise.all`) → exactly one succeeds, `seats_taken = 3` | Integration (real Postgres) |

---

## 16. Delivery plan

Each milestone is one `feature/*` branch, merged into `master` when it works.

**Backend first, then frontend.** The whole API is built and tested before any UI code exists.

| # | Branch | Delivers |
|---|---|---|
| | **Phase A: Backend** | |
| 1 | `feature/project-setup` | Monorepo, NestJS skeleton, Docker Compose (api + postgres), health check |
| 2 | `feature/database-schema` | 5 tables, constraints, seed cast |
| 3 | `feature/passenger-auth` | Sign up / in, JWT, roles |
| 4 | `feature/ride-request` | Estimate, request, my rides, cancel |
| 5 | `feature/tesla-pooling` | Matching rule, seat claim, concurrency test |
| 6 | `feature/driver-flow` | Online/offline, accept, arrive/start/complete, demo request file |
| ✅ | Backend checkpoint | Full demo (§14) runs through the API alone; T1–T6 pass |
| | **Phase B: Frontend** | |
| 7 | `feature/web-setup` | Next.js skeleton in Docker, API client, login, role redirect |
| 8 | `feature/passenger-ui` | Passenger screens |
| 9 | `feature/driver-ui` | Driver screens |
| | **Phase C: Ship** | |
| — | `pre-release` | Integration fixes, README, diagrams, deployment checks |
| — | `release/v1.0.0` | The version shown in the video and deployment |

---

## 17. Success criteria

The MVP is done when:

- [ ] The demo script (§14) runs end to end on a fresh `docker compose up`
- [ ] Tests T1–T6 pass
- [ ] Nusrat and Rafiq's fares match the hand calculation in §7
- [ ] No passenger can see another passenger's fare or details
- [ ] README covers every item the brief lists, including AI usage and the video link
- [ ] Git history shows `feature/* → master → pre-release → release/v1.0.0` with meaningful commits

---

## 18. Next improvements (after MVP)

1. **Per-passenger drop-off** — Nusrat completes at Mohakhali while Rafiq rides on to Gulshan 1.
2. **Route-aware matching** — pool by direction (corridor), not just pickup zone.
3. **Request timeout** — auto-cancel if unmatched after 10 minutes.
4. **TeslaPay wallet** — simulated balance and ride charges.
5. **Real-time updates** — WebSockets instead of polling.
6. **Ratings** after a completed ride.