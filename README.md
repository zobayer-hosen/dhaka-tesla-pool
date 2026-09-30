# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

A ride-pooling MVP. Strangers heading the same way share one small 3-seat car. Each pays a fair fare you can check by hand, and nobody sees anyone else's details. The driver moves the whole trip through **Arrived → Start → Complete**. The app never sells a seat that doesn't exist, even when two people grab the last one at the same moment.

**Live demo:** https://dhaka-tesla-pool-web-five.vercel.app · **API:** [health check](https://dhaka-tesla-pool-7d8l.onrender.com/api/v1/health) · **Design docs:** [PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [ERD](docs/ERD.md) · [Decisions](docs/DECISIONS.md) · [Scaling](docs/SCALING.md)

---

## At a glance

| | |
|---|---|
| **What** | Passengers book rides, get pooled automatically with others from the same pickup zone, and each see only their own fare and status. One driver runs the trip. |
| **Try it live** | https://dhaka-tesla-pool-web-five.vercel.app (free hosting: the first request after ~15 idle minutes takes 30–60 s) |
| **Log in as** | `jashim@teslapool.dev` (driver of Bullet) · `kamal@teslapool.dev` (driver of Toofan) · `nusrat@teslapool.dev`, `rafiq@teslapool.dev`, `shirin@teslapool.dev` (passengers). Password for all: `password123` (demo only) |
| **Stack** | Next.js 16 · NestJS 11 (REST) · PostgreSQL · TypeORM · Docker Compose · TypeScript everywhere |
| **Hardest problem** | Two people booking the last seat at the same instant. Solved with **one atomic SQL `UPDATE`** plus a `CHECK` constraint, and proved by a 20-round race test ([details](#1-the-last-seat-concurrency)) |
| **Tests** | **91 passing**: 79 API tests (36 unit + 43 end-to-end against a real Postgres) + 12 web tests, covering the six required scenarios T1–T6 ([details](#testing)) |
| **Run locally** | `cp .env.example .env && docker compose up --build` → http://localhost:3000 |
| **Hosting** | Vercel (web) + Render (API) + Neon (Postgres), all free tiers ([details](#deployment)) |

## Contents

1. [Try it in 3 minutes](#try-it-in-3-minutes)
2. [The problem](#the-problem)
3. [What it does](#what-it-does)
4. [How it works](#how-it-works)
5. [Engineering highlights](#engineering-highlights)
6. [Code tour: where to look](#code-tour-where-to-look)
7. [Testing](#testing)
8. [Run it locally](#run-it-locally)
9. [API overview](#api-overview)
10. [Deployment](#deployment)
11. [Key decisions and trade-offs](#key-decisions-and-trade-offs)
12. [Technology choices](#technology-choices)
13. [Known limitations and next improvements](#known-limitations-and-next-improvements)
14. [Project structure and documentation](#project-structure-and-documentation)
15. [AI usage](#ai-usage) · [Demo video](#demo-video)

---

## Try it in 3 minutes

Each browser session keeps its own login, so use separate sessions for the driver and the passengers (for example a normal window, a private window and a second browser). Pages refresh themselves every 5 seconds.

| # | Who | Do this | You should see |
|---|---|---|---|
| 1 | Jashim | Log in → **Go online** | "No requests right now" |
| 2 | Nusrat | **Book** Banani → Mohakhali, 1 seat → **Confirm ride** | Estimate **100 taka**, then status "Waiting" |
| 3 | Jashim | **Accept** Nusrat's request | Current trip: **1 / 3 seats** |
| 4 | Rafiq | Book Banani → Gulshan 1, 1 seat | He **joins automatically**: 2 / 3 seats. Rafiq pays **100**, Nusrat's fare drops **100 → 85** |
| 5 | Shirin | Book Banani → Gulshan 1, **2 seats** | Only 1 seat is left, so she **waits** (the edge case) |
| 6 | Shirin | **Cancel ride**, then book again with 1 seat | She joins: **3 / 3 seats**, the pool is full |
| 7 | Jashim | **Arrived** → **Start trip** → **Complete trip** | Every passenger sees each step, then "Completed" and the ride in their history |

**A second driver:** log in as **Kamal** (he drives **Toofan**, also 3 seats) and go online. While Bullet is full, a new Banani passenger waits as "Waiting". Jashim isn't offered them, but Kamal is, and accepting starts a new trip in Toofan.

A privacy check that has no screen: Nusrat asking for Rafiq's ride id gets **`404`**, not `403`, so the API doesn't even admit that the ride exists (step 7 in [`docs/api/demo.http`](docs/api/demo.http)).

The live database is shared, so if someone else is mid-demo, your numbers may differ; [`demo:reset`](#reset-the-demo-data) clears old rides. Locally, `docker compose down -v && docker compose up --build` gives a clean start.

---

## The problem

8:41 AM, Banani Road 11. **Jashim** drives **Bullet**, a 3-seat car. **Nusrat** (Banani → Mohakhali) and **Rafiq** (Banani → Gulshan 1) are strangers going the same way. Riding alone costs each of them more, and two of Bullet's seats go empty. They need to:

- share one vehicle and each pay a **fair individual fare**;
- see **only their own** ride details;
- let Jashim see exactly who is riding and which stage the trip is at.

When **Shirin** tries for the last seat, the app must never overbook Bullet. After every ride, the history must explain what happened.

## What it does

**Passenger**
- Sign up / log in (JWT, bcrypt-hashed passwords).
- Fare estimate before booking: the solo fare, plus the pooled fare when an open pool can take you.
- Request a ride: you **auto-join** an open pool in your pickup zone, or wait as `REQUESTED` for the driver.
- "My ride": progress bar, driver + vehicle, **my own fare** with its breakdown, "Shared with N other passengers", and cancel before the driver arrives.
- Ride history (completed and cancelled), newest first.

**Driver (Jashim)**
- Go online / offline (not possible during a trip).
- See only the waiting requests he can actually accept, and accept one: this creates a pool or adds to the open one.
- Current trip: passengers (first name, drop-off, seats, fare for cash), a seat counter like **2 / 3 seats**, and one next-step button.
- Trip history with passengers and total fare.

**System**
- Seats can never exceed capacity, even under simultaneous requests.
- Every status or fare change is written to a history table (`ride_events`) in the same transaction.
- Every screen that loads data has loading, error (with retry) and empty states.
- One command runs everything: `docker compose up --build` (db → api with migrations + seed → web).

## Screenshots

<!-- SCREENSHOTS -->

---

## How it works

### Architecture

Three parts, one direction. The browser loads pages from Next.js, and the page code calls the NestJS API **directly** with the login token (JWT). Only the API talks to the database. The API has four modules: **Auth**, **Rides** (including pooling), **Driver** and **Fare** (pure math, no database). Every request passes the same checks: valid input → who is this (JWT) → are they allowed (role, and "is this your own ride?").

```mermaid
flowchart LR
  B["Browser<br/>Nusrat · Rafiq · Shirin · Jashim"]
  W["Next.js<br/>web pages"]
  A["NestJS API /api/v1<br/>Auth · Rides · Driver · Fare"]
  D[("PostgreSQL<br/>5 tables")]
  B -- "loads pages" --> W
  B -- "fetch + JWT<br/>(CORS: WEB_ORIGIN only)" --> A
  A -- "SQL via TypeORM<br/>(transactions)" --> D
```

More diagrams (sequence diagram of the race, lock order): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Ride lifecycle

A ride moves one step at a time; any other move is rejected with `409 INVALID_TRANSITION`. The pool moves through the same steps, and when Jashim taps a button, the pool **and every passenger in it** move together.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> REQUESTED: passenger books
  REQUESTED --> MATCHED: gets a seat in a pool
  MATCHED --> DRIVER_ARRIVED: Jashim arrives
  DRIVER_ARRIVED --> STARTED: Jashim starts
  STARTED --> COMPLETED: Jashim completes
  REQUESTED --> CANCELLED: passenger cancels
  MATCHED --> CANCELLED: passenger cancels
```

### Database

Five tables: `users` (passengers and the driver), `vehicles` (Bullet, capacity 3), `pools` (one trip of one vehicle, with `seats_taken`), `ride_requests` (one passenger's booking with **their own** fare breakdown) and `ride_events` (append-only history: who changed what, when). Full columns, constraints and indexes: [docs/ERD.md](docs/ERD.md).

![ERD](docs/ERD.png)

---

## Engineering highlights

### 1. The last seat (concurrency)

Bullet has 1 seat left, and Nusrat and Shirin book at the same instant. If the code read "1 free" and then wrote "+1", both requests could read before either wrote, and 4 people would end up in a 3-seat car. So the check and the change are **one SQL statement**:

```sql
UPDATE pools SET seats_taken = seats_taken + :seats
WHERE id = :poolId AND status = 'MATCHED' AND seats_taken + :seats <= capacity;
-- 1 row changed = got the seat · 0 rows changed = full
```

Postgres locks the row for the first `UPDATE` and makes the second wait. When the second runs, it re-checks the `WHERE` against the new count and changes 0 rows.

- **The losing request isn't lost.** It was saved first, in the same transaction. It stays `REQUESTED`, and the API still answers `201`. That's why [`claimSeat`](apps/api/src/rides/pooling.service.ts#L37) returns `true`/`false` and never throws: throwing would roll back the transaction and delete her booking.
- **Only a driver accept** turns "0 rows" into `409 POOL_FULL`, because Jashim asked for that exact seat.
- **Safety net:** `CHECK (seats_taken BETWEEN 0 AND capacity)` on the `pools` table.
- **Proof:** the test fires both bookings with `Promise.all`, 20 rounds in a row. Every round, exactly one is `MATCHED`, the other is saved as `REQUESTED`, and `seats_taken = 3`. As a check, we temporarily replaced the atomic update with "load → `+=` → `save()`": **19 of 20 rounds overbooked Bullet**.

### 2. Other races: status changes and lock order

- **Every status change is a conditional update:** `… SET status = :next WHERE id = :id AND status = :expected`. If 0 rows change, someone else moved the ride first → `409`.
- **The pool row is always locked first** (`SELECT … FOR UPDATE`), then its ride requests. Because every transaction uses the same order, "Rafiq cancels" and "Jashim taps Arrived" at the same moment **wait for each other instead of deadlocking**. A 20-round test races exactly that.

### 3. Fares you can check by hand, stored as integers

```
seatFare      = baseFare + distanceCharge − poolDiscount
passengerFare = seatFare × seats
baseFare = 40 taka · distanceCharge = km × 20 taka
poolDiscount = 25% of distanceCharge, only when the pool has 2+ bookings (bookings, not seats)
```

| | Nusrat (Banani → Mohakhali, 3 km) | Rafiq (Banani → Gulshan 1, 4 km) |
|---|---|---|
| Base fare | 40 | 40 |
| Distance charge | 3 × 20 = 60 | 4 × 20 = 80 |
| **Solo fare** | **100 taka** | **120 taka** |
| Pool discount (25% of distance) | −15 | −20 |
| **Pooled fare** | **85 taka** | **100 taka** |

- Nusrat sees 100 taka while alone and 85 once Rafiq joins. The fare is **locked when the trip starts**; if Rafiq cancels before that, Nusrat goes back to 100.
- **Money is always an integer in paisa** (85 taka = `8500`) in the database, the API and the tests. Floats can't store money exactly (`0.1 + 0.2 ≠ 0.3`). The discount is rounded down to a whole paisa, and the browser only formats (`৳85.00`), never calculates.
- A `CHECK` constraint makes sure every saved fare adds up: `fare = (base + distance − discount) × seats`.

### 4. Privacy

- A passenger can only read or cancel **their own** rides. Anyone else's ride returns **`404`, not `403`**, so the API doesn't reveal that it exists. A wrong role (a passenger calling driver endpoints) returns `403`.
- A ride's timeline says who acted as `YOU`, `DRIVER` or `SYSTEM`, never a name. Fare notes say "Another passenger joined", never "Rafiq joined".
- Passengers see how many others share the car ("Shared with 1 other passenger"), never their names or fares. The driver sees first names only, plus fares for collecting cash.

### 5. A history that explains what happened

Every status or fare change writes a `ride_events` row **in the same transaction** as the change, so the change and its history can never disagree. Rows are only ever added. From `ride_requests` (the final state) and `ride_events` (the timeline) you can answer "what happened to Nusrat's ride?" after the fact.

---

## Code tour: where to look

| What | Where |
|---|---|
| Atomic seat claim (`claimSeat`) | [`apps/api/src/rides/pooling.service.ts#L37`](apps/api/src/rides/pooling.service.ts#L37) |
| Lock the pool row first (`lockPool`, `FOR UPDATE`) | [`apps/api/src/rides/pooling.service.ts#L61`](apps/api/src/rides/pooling.service.ts#L61) |
| Book a ride: save first, then try to auto-join, in one transaction | [`apps/api/src/rides/rides.service.ts#L82`](apps/api/src/rides/rides.service.ts#L82) |
| Cancel: lock pool → conditional update → free seats → recalculate fares | [`apps/api/src/rides/rides.service.ts#L213`](apps/api/src/rides/rides.service.ts#L213) |
| Driver accept (`false` from `claimSeat` → `409 POOL_FULL`) | [`apps/api/src/driver/driver.service.ts#L113`](apps/api/src/driver/driver.service.ts#L113) |
| Arrived / Start / Complete for the whole pool | [`apps/api/src/driver/driver.service.ts#L243`](apps/api/src/driver/driver.service.ts#L243) |
| Allowed status moves | [`apps/api/src/rides/ride-state-machine.ts`](apps/api/src/rides/ride-state-machine.ts) |
| Fare math (pure, no database) | [`apps/api/src/fare/fare.service.ts#L28`](apps/api/src/fare/fare.service.ts#L28) |
| "Only your own ride, else 404" | [`apps/api/src/rides/rides.service.ts#L268`](apps/api/src/rides/rides.service.ts#L268) |
| `CHECK` constraints on the tables | [`pool.entity.ts#L20`](apps/api/src/database/entities/pool.entity.ts#L20), [`ride-request.entity.ts`](apps/api/src/database/entities/ride-request.entity.ts) |
| One error shape for every error: `{ statusCode, code, message }` | [`apps/api/src/common/all-exceptions.filter.ts`](apps/api/src/common/all-exceptions.filter.ts) |
| The last-seat race test (T6) | [`apps/api/test/concurrency.e2e-spec.ts#L42`](apps/api/test/concurrency.e2e-spec.ts#L42) |
| Cancel-vs-Arrived deadlock test | [`apps/api/test/driver.e2e-spec.ts#L335`](apps/api/test/driver.e2e-spec.ts#L335) |
| The browser's API client (JWT, error handling) | [`apps/web/lib/api.ts`](apps/web/lib/api.ts) |

---

## Testing

Tests target the risky behaviour, not a coverage number. The same cast (Jashim, Bullet, Nusrat, Rafiq, Shirin) is used in every test.

| # | What it proves | Where |
|---|---|---|
| T1 | Bullet's capacity can never be exceeded (a 4th seat is refused) | [`pooling.e2e-spec.ts#L95`](apps/api/test/pooling.e2e-spec.ts#L95) |
| T2 | Invalid moves are rejected (e.g. `REQUESTED → COMPLETED`) | [`ride-state-machine.spec.ts`](apps/api/src/rides/ride-state-machine.spec.ts) (unit), [`driver.e2e-spec.ts#L289`](apps/api/test/driver.e2e-spec.ts#L289) (over HTTP) |
| T3 | Nusrat pooled = 8500 paisa, Rafiq pooled = 10000, solo = 10000 / 12000 | [`fare.service.spec.ts`](apps/api/src/fare/fare.service.spec.ts) |
| T4 | Rafiq can't read or cancel Nusrat's ride (`404`); a passenger can't call driver endpoints (`403`) | [`rides.e2e-spec.ts#L169`](apps/api/test/rides.e2e-spec.ts#L169) |
| T5 | Cancel works before arrival and frees the seats; after arrival it's refused | [`rides.e2e-spec.ts#L210`](apps/api/test/rides.e2e-spec.ts#L210), [`driver.e2e-spec.ts#L322`](apps/api/test/driver.e2e-spec.ts#L322) |
| T6 | Nusrat and Shirin grab the last seat at once: both get `201`, exactly one is `MATCHED`, `seats_taken = 3` (20 rounds) | [`concurrency.e2e-spec.ts#L42`](apps/api/test/concurrency.e2e-spec.ts#L42) |

**Results:** 91 tests pass: API 79 (36 unit tests in 7 suites + 43 end-to-end tests in 7 suites) and web 12 (2 suites, the page rules such as "Not shared yet"). The end-to-end tests call the real HTTP API and use a real Postgres database. It's a separate database whose name must end in `_test`, so tests can never wipe your data.

```bash
docker compose up -d db          # the tests need the database
npm test -w apps/api             # unit + end-to-end (T1–T6)
npm test -w apps/web             # page rules (no browser needed)
npm run lint                     # ESLint (type-aware) + Prettier
```

**CI:** every pull request builds the API Docker image (GitHub Actions) and a preview of the web app (Vercel). Lint and tests run locally before every merge; running them in CI is a listed next step.

---

## Run it locally

**Prerequisites:** Docker Desktop (or Docker Engine + Compose v2). To run outside Docker: Node.js 24 and npm 11.

### With Docker (recommended)

```bash
git clone https://github.com/zobayer-hosen/dhaka-tesla-pool.git
cd dhaka-tesla-pool
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1 (health: `/api/v1/health`)

On every start, the API container runs the migrations, then the seed (safe to repeat), then the app. Start from an empty database with `docker compose down -v && docker compose up --build`.

### Without Docker for the apps

```bash
npm install
docker compose up -d db          # only the database
npm run migration:run -w apps/api
npm run seed -w apps/api         # Jashim, Bullet, Nusrat, Rafiq, Shirin
npm run dev:api                  # http://localhost:4000
npm run dev:web                  # http://localhost:3000
```

`npm run migration:show -w apps/api` lists applied `[X]` and pending `[ ]` migrations. The backend can also be driven with no UI: [`docs/api/demo.http`](docs/api/demo.http) runs the whole demo (VS Code REST Client).

<details>
<summary><b>Environment variables</b> (<code>.env</code>, copied from <code>.env.example</code>)</summary>

The values in `.env.example` are placeholders; never commit `.env`.

| Variable | Used by | Example | Meaning |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | `teslapool` / `changeme` / `teslapool` | Database the db container creates |
| `DB_PORT` | compose | `5432` | Port of the db container **on your machine** (see below) |
| `DATABASE_URL` | api (local run) | `postgres://teslapool:changeme@localhost:5432/teslapool` | In Docker, compose builds it with host `db` |
| `JWT_SECRET` | api | long random string | Signs login tokens |
| `JWT_EXPIRES_IN` | api | `1h` | Token lifetime |
| `WEB_ORIGIN` | api | `http://localhost:3000` | The browser origin allowed by CORS (several: separate with commas) |
| `NEXT_PUBLIC_API_URL` | web (build time) | `http://localhost:4000/api/v1` | Where the browser finds the API. Public, never a secret |
| `TEST_DATABASE_URL` | tests | `…/teslapool_test` | Test database. Must end in `_test`; created and emptied automatically |

</details>

<details>
<summary><b>Port 5432 already in use?</b> (common on Windows)</summary>

If PostgreSQL is already installed on your machine, it owns port **5432**. The db container then can't publish that port, or your local tools reach the **wrong** Postgres and fail with `role "teslapool" does not exist`. Fix it without stopping your own Postgres:

1. In `.env`, set `DB_PORT=5433`.
2. Change the port in `DATABASE_URL` and `TEST_DATABASE_URL` to `5433` too (they are used from your machine).
3. `docker compose down && docker compose up --build`.

Containers still talk to each other on `db:5432`. Only the port on your machine changes.

</details>

---

## API overview

REST, prefix `/api/v1`. Errors always have the same shape, e.g. `{ "statusCode": 409, "code": "POOL_FULL", "message": "This ride just filled up" }`.

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/signup` | Public | Create a passenger account (also logs in) |
| `POST /auth/login` | Public | Get a JWT |
| `GET /auth/me` | Logged in | Current user |
| `GET /zones` | Logged in | The 8 zones |
| `POST /rides/estimate` | Passenger | Solo and pooled fare |
| `POST /rides` | Passenger | Request a ride: always `201`, `MATCHED` (auto-join) or `REQUESTED` |
| `GET /rides` | Passenger | My history |
| `GET /rides/current` | Passenger | My active ride with `coRiderCount` (`404` if none) |
| `GET /rides/:id` | Owner | One ride with its timeline (`404` if not yours) |
| `POST /rides/:id/cancel` | Owner | Cancel before the driver arrives |
| `GET /driver/status` · `PATCH /driver/status` | Driver | Read / set online |
| `GET /driver/requests` | Driver | Waiting requests he can accept |
| `POST /driver/requests/:id/accept` | Driver | Create or join the pool |
| `GET /driver/pool` | Driver | Current trip (`404` if none) |
| `POST /pools/:id/arrive` · `/start` · `/complete` | Pool's driver | Move the whole trip forward |
| `GET /driver/history` | Driver | Completed trips |
| `GET /health` | Public | Health check |

Error codes: `VALIDATION_ERROR` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 (wrong role) · `NOT_FOUND` 404 (doesn't exist **or isn't yours**) · `POOL_FULL`, `POOL_NOT_JOINABLE`, `REQUEST_UNAVAILABLE`, `DRIVER_OFFLINE`, `INVALID_TRANSITION`, `ACTIVE_RIDE_EXISTS`, `EMAIL_TAKEN` 409.

**Matching rule:** two requests can share a pool when they have the **same pickup zone**, the driver **hasn't arrived yet** (pool still `MATCHED`), and there are **enough free seats**. Drop-off zones may differ. The rule is simple, explainable, and covers Nusrat and Rafiq's trip. Route-aware matching is a next improvement.

---

## Deployment

| Part | Where | Details |
|---|---|---|
| Web | https://dhaka-tesla-pool-web-five.vercel.app | Vercel project `dhaka-tesla-pool-web` (`apps/web`); deploys `master` automatically |
| API | https://dhaka-tesla-pool-7d8l.onrender.com/api/v1 | Render free web service (`apps/api`, Docker image) |
| Database | Neon project `tiny-truth-55799906`, branch `production`, database `neondb` | AWS us-east-1, Postgres 18.6 (DECISIONS #34) |

```mermaid
flowchart LR
  B["Browser"] -- "loads pages" --> V["Vercel<br/>Next.js"]
  B -- "fetch + JWT<br/>(CORS: WEB_ORIGIN)" --> R["Render<br/>NestJS API"]
  R -- "POOLED URL, TLS" --> N[("Neon Postgres<br/>production")]
  M["Your machine<br/>migrations + seed"] -- "DIRECT URL, TLS" --> N
```

- **Two settings connect the halves,** because the browser calls the API directly: Vercel's `NEXT_PUBLIC_API_URL` is the API address, and Render's `WEB_ORIGIN` is the site's address (CORS).
- **Cold start:** the free Render API sleeps after ~15 idle minutes. The next request takes about 30–60 s, then it's fast again. Neon's free database also pauses when idle and adds a few hundred ms to its first query.
- **Migrations never run when the API starts in production.** They're a deliberate, manual step with the direct database URL, after a read-only check and a restore point (DECISIONS #35). Docker still runs them automatically for the local one-command demo.
- **Fallback:** `docker compose up --build` runs the whole system on any machine with Docker. It was checked on a fresh clone before release, with the full demo passing through the API.

<details>
<summary><b>Production environment variables</b></summary>

| Variable | Render (API) | Vercel (web) | Notes |
|---|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL (secret) | never | Ends in `?sslmode=verify-full` |
| `JWT_SECRET` | long random value (secret) | never | Changing it logs everyone out |
| `JWT_EXPIRES_IN` | `1h` | — | The API won't start without it |
| `WEB_ORIGIN` | `https://dhaka-tesla-pool-web-five.vercel.app` | — | Exact match: `https`, no trailing `/`. Several origins: separate with commas |
| `NODE_ENV` | `production` | set by Vercel | |
| `PORT` | set by Render | — | Don't set it yourself |
| `NEXT_PUBLIC_API_URL` | — | `https://dhaka-tesla-pool-7d8l.onrender.com/api/v1` | **Public**: built into the browser code at build time. Redeploy after changing it |

Secrets live only in your local `.env` and the Render dashboard, never in Git, docs, Vercel or a `NEXT_PUBLIC_` variable.

</details>

<details>
<summary><b>Render, Vercel and Neon settings</b></summary>

**Render (API).** The live service runs the Docker image:

| Setting | Value |
|---|---|
| Branch | `master` |
| Dockerfile Path / build context | `apps/api/Dockerfile` / repo root |
| Docker Command | `node dist/main.js`, which replaces the image's "migrate → seed → start" so production never migrates on start |
| Health Check Path | `/api/v1/health` |
| Instance Type | Free |

[`render.yaml`](render.yaml) describes the same API on Render's Node runtime, if you ever create it as a Blueprint. It builds with `npm ci -w apps/api --include=dev && npm run build -w apps/api` and starts with `npm run start:prod -w apps/api`. Creating a Blueprint from it would add a second service.

**Vercel (web).** Framework Preset: Next.js. Root Directory: `apps/web`. Install and Build: defaults (npm workspaces install from the repo root). Node.js 24.x (recommended). Environment variable: `NEXT_PUBLIC_API_URL` (Production and Preview). Preview deployments get their own `*.vercel.app` URLs, which aren't in `WEB_ORIGIN`, so CORS blocks their API calls; test on the production domain.

**Neon.**

- **Pooled URL for the app, direct URL for migrations.** The pooled host contains `-pooler`: PgBouncer shares a few connections, which is safe because the app keeps no session state. Migrations, the seed and `pg_dump` need the **direct** host (no `-pooler`) (DECISIONS #36).
- **SSL comes from the URL:** end it with `?sslmode=verify-full` (encrypted, certificate checked). There's no SSL code in the app.
- **Getting the URLs:** Neon Console → Connect (toggle "Connection pooling"), or in your own terminal (it prints the password): `neon connection-string production --project-id tiny-truth-55799906 --database-name neondb --ssl verify-full`, adding `--pooled` for the app's URL.
- **CLI setup:** `npm install -g neon`, then `neon login`, then `neon link --project-id tiny-truth-55799906 --branch production -y --no-env-pull`. Without `--no-env-pull`, `link` writes production's `DATABASE_URL` into your local `.env`. There's no `neon.ts` and no `neon deploy`, because the app only uses Neon Postgres (DECISIONS #39).

</details>

### Production migrations

`production` was migrated and seeded on 2026-09-30, after a restore-point branch (since deleted). For the next migration:

1. **Target:** `production` / `neondb`, using the **direct** URL.
2. **Look read-only first.** `migration:show` creates TypeORM's empty `migrations` table on a never-migrated database, so run it in a read-only session.
3. **Restore point:** `neon branches create --project-id tiny-truth-55799906 --name pre-migration-YYYYMMDD --parent production --no-compute`.
4. **Get approval,** then run:

```powershell
$env:DATABASE_URL = Read-Host -MaskInput "Neon DIRECT url (no -pooler)"   # not kept in shell history
$env:PGOPTIONS = "-c default_transaction_read_only=on"; npm run migration:show -w apps/api; Remove-Item Env:PGOPTIONS
npm run migration:run -w apps/api
npm run seed -w apps/api              # demo cast, safe to repeat
npm run migration:show -w apps/api    # every line [X]
Remove-Item Env:DATABASE_URL          # back to .env (localhost)
```

A `DATABASE_URL` set in the terminal wins over `.env`, so one command can target Neon without editing `.env`. To roll back, run `npm run migration:revert -w apps/api`, or restore `production` from the restore-point branch.

### Reset the demo data

Testing leaves rides behind on the shared live database, and they change what the next demo shows (for example, a rider who still has an active ride). `npm run demo:reset -w apps/api` empties it again:

- it deletes every **ride event, ride request and pool**, in one transaction;
- it keeps **users and vehicles** (the cast and Bullet) and sets **drivers offline**, so the demo starts again at "Jashim goes online";
- it **refuses to run unless `DEMO_RESET=yes`** is set, and prints the target database and the row counts before and after.

```powershell
$env:DATABASE_URL = Read-Host -MaskInput "Neon DIRECT url (no -pooler)"   # not kept in shell history
$env:DEMO_RESET = "yes"; npm run demo:reset -w apps/api; Remove-Item Env:DEMO_RESET
Remove-Item Env:DATABASE_URL          # back to .env (localhost)
```

Locally, against the database in `.env`: `DEMO_RESET=yes npm run demo:reset -w apps/api`. A reset can't be undone except by restoring from Neon, so create a restore-point branch first on `production`, as for migrations.

<details>
<summary><b>Verify the live deployment, and common errors</b></summary>

```bash
API=https://dhaka-tesla-pool-7d8l.onrender.com/api/v1
curl -s $API/health                                      # {"status":"ok"}
curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"nusrat@teslapool.dev","password":"password123"}'
curl -s -o /dev/null -D - -H "Origin: https://dhaka-tesla-pool-web-five.vercel.app" $API/health \
  | grep -i access-control-allow-origin                  # must echo the Vercel domain
```

| Symptom | Cause | Fix |
|---|---|---|
| Site says "Can't reach the server"; console says "blocked by CORS policy" | `WEB_ORIGIN` isn't exactly the site's origin, or the new value isn't deployed yet | Fix `WEB_ORIGIN` on Render, then check Events shows "Deploy live" |
| The site calls `http://localhost:4000` | `NEXT_PUBLIC_API_URL` wasn't set when Vercel built | Set it, then Redeploy |
| API won't start: `Configuration key "…" does not exist` | Missing variable on Render | Add it in Environment |
| `password authentication failed` | Password was reset after the URL was copied | Copy a fresh pooled URL into Render |
| `connection is insecure` | URL has no `sslmode` | End it with `?sslmode=verify-full` |
| `relation "users" does not exist` | Migrations not run on this Neon branch | See Production migrations |
| First request takes 30–60 s | Render free service was asleep | Expected on the free plan |

**Security:** rotate any credential that was ever pasted into a chat or screenshot (Neon Console → Roles → reset password), then update Render. The hosted demo uses the public demo logins, so never enter real personal data.

</details>

---

## Key decisions and trade-offs

All 39 decisions, each with its reason, are in [docs/DECISIONS.md](docs/DECISIONS.md). The main ones:

| Decision | Why | Trade-off |
|---|---|---|
| Match by same pickup zone | Simple, explainable, covers the story | Misses pools with a nearby pickup |
| Integer paisa | Exact money, easy tests | Divide by 100 when displaying |
| One conditional `UPDATE` for seats and statuses | The database serialises the race | Slightly less "ORM-style" code |
| Lock the pool row first, always | No deadlocks between cancel and driver steps | Short waits under contention |
| A losing auto-join stays `REQUESTED` (`201`) | A booking is never lost | The passenger waits for the driver |
| Discount and "Shared with N" count bookings, not seats | Sharing with someone else is what earns it | — |
| Polling every 5 s, not WebSockets | Simple, stateless, enough for a demo | Up to 5 s delay, more requests |
| Browser calls the API directly with a JWT | No proxy layer | Token in localStorage (see limitations) |
| Production migrations by hand, never on start | A failed migration can't crash-loop the API | One manual step per schema change |
| Cash only, drivers seeded | Out of the story's scope | No payments, no driver onboarding |
| Whole pool completes at once | One lifecycle, easy to explain | No per-passenger drop-off yet |

## Technology choices

| | Picked | Realistic alternatives | Why it fits a ride-pooling MVP | What would make us switch |
|---|---|---|---|---|
| Database | PostgreSQL (16 locally and in tests, 18.6 on Neon) | MySQL, MongoDB | Transactions, row locks, `CHECK` constraints and partial unique indexes protect seats and money inside the database | Location data at huge scale → add a geo/in-memory store next to it, not instead of it |
| ORM | TypeORM | Prisma, Drizzle, raw `pg` | Official NestJS module, transactions + QueryBuilder for the atomic `UPDATE`, generated migrations | If typed query results mattered more than NestJS integration → Drizzle/Prisma |
| Backend | NestJS | Express, Fastify, Spring | Modules, guards, pipes and DI give auth, validation and roles with little glue | A tiny service → plain Fastify; a Java team → Spring |
| Auth | JWT (passport-jwt) + bcrypt | Sessions, OAuth provider | Stateless API called directly from the browser; simple to test | Production → httpOnly cookie or an identity provider with refresh tokens |
| Validation | class-validator + global `ValidationPipe` | Zod, Joi | Decorators on DTOs, one pipe for every endpoint, unknown fields rejected | Sharing schemas with the frontend → Zod |
| Styling | Tailwind CSS | CSS modules, a UI kit | Clean screens fast, no component library to learn or ship | A design system with many designers → a component library |
| Tests | Jest + supertest | Vitest, Playwright | End-to-end tests hit the real HTTP API and a real Postgres, where the race conditions live | Browser flows → add Playwright |
| Hosting | Vercel + Render + Neon (free), Docker Compose as the fallback | Railway, Fly.io, Supabase | Each host runs its part natively, and Neon is plain Postgres, so the same code and migrations run everywhere | Always-on traffic → paid instances (no sleeping) |

**If it went viral** (1M passengers, 100k drivers; reasoning in [docs/SCALING.md](docs/SCALING.md)): bookings stay in Postgres because they must be correct. Driver locations, once GPS is added (~25,000 writes/s), would go to a fast in-memory store. Read copies of the database would serve history screens, and idempotency keys would stop a double-tap on a bad network from booking twice.

---

## Known limitations and next improvements

**Known limitations**
- Matching is by pickup zone only, with a fixed zone/distance table (no maps, GPS or ETAs).
- The whole pool completes at once; there's no per-passenger drop-off.
- Status updates arrive by polling (up to 5 s late).
- The JWT is stored in `localStorage`: an XSS bug could read it. Production should use an httpOnly cookie.
- Drivers are seeded (Jashim with Bullet, Kamal with Toofan); there's no driver sign-up (PRD A3).
- There's no ride-detail screen; the timeline is available at `GET /rides/:id`.
- Free hosting: the API sleeps after ~15 idle minutes (the next request takes 30–60 s), and only the production Vercel domain is allowed by CORS, not preview URLs.
- CI builds the Docker image and a web preview; lint and tests run locally, not in CI yet.

**Next improvements**
1. Per-passenger drop-off (Nusrat gets out at Mohakhali while Rafiq rides on).
2. Route-aware matching (pool by direction, not only pickup zone).
3. Auto-cancel requests that stay unmatched for 10 minutes.
4. Simulated wallet (TeslaPay).
5. WebSockets instead of polling.
6. Ratings after a completed ride.
7. Lint and tests in CI, plus a Playwright smoke test against the live site.

---

## Project structure and documentation

```
dhaka-tesla-pool/
├── apps/
│   ├── api/                  NestJS API
│   │   ├── src/
│   │   │   ├── auth/         signup, login, JWT, roles guard
│   │   │   ├── rides/        request, cancel, history, PoolingService (claimSeat), state machine
│   │   │   ├── driver/       online/offline, accept, arrive → start → complete, history
│   │   │   ├── fare/         pure fare math (paisa)
│   │   │   ├── database/     entities, migrations, seed, demo reset
│   │   │   └── common/       error filter, request logger
│   │   ├── test/             end-to-end tests (T1–T6) against Postgres
│   │   └── Dockerfile
│   └── web/                  Next.js app
│       ├── app/              pages: login, signup, (passenger)/ride/*, rides, driver/*
│       ├── components/       Button, Card, Spinner, EmptyState, ErrorState, StatusBadge, …
│       ├── lib/              api.ts (fetch + JWT), auth.tsx, money.ts (formatTaka)
│       └── Dockerfile
├── docs/                     design documents (below)
├── docker-compose.yml        db → api → web, with health checks
├── render.yaml               Render blueprint for the API
└── .env.example              every variable, placeholders only
```

| Document | What's in it |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Requirements: user stories with acceptance criteria, assumptions, fare model, API list, T1–T6 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams: system, ERD, lifecycle, the last-seat race step by step, lock order |
| [docs/ERD.md](docs/ERD.md) | Every table, column, constraint and index, and the demo story as database rows |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every design decision with its reason (39 entries) |
| [docs/SCALING.md](docs/SCALING.md) | What would break first at 1M passengers, and what we'd add |
| [docs/AI_LOG.md](docs/AI_LOG.md) | Where AI suggestions were accepted, changed or rejected, and why |
| [docs/api/demo.http](docs/api/demo.http) | The full demo as API requests (VS Code REST Client) |

## AI usage

<!-- AI USAGE: written by me -->

## Demo video

<!-- VIDEO LINK -->
