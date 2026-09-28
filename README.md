# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

A ride-pooling MVP. Strangers heading the same way share one small battery "Tesla", each pays a fair, hand-checkable fare, and nobody sees anyone else's details. The driver moves the whole trip through **Arrived → Start → Complete**, and the app never sells a seat that doesn't exist, even when two people grab the last one at the same moment.

**Stack:** Next.js · NestJS (REST) · PostgreSQL 16 · TypeORM · Docker Compose
**Design docs:** [PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [ERD](docs/ERD.md) · [Decisions](docs/DECISIONS.md) · [Scaling](docs/SCALING.md)

---

## Problem statement

8:41 AM, Banani Road 11. **Jashim** drives **Bullet**, a 3-seat car. **Nusrat** (Banani → Mohakhali) and **Rafiq** (Banani → Gulshan 1) are strangers going the same way. Riding alone costs each of them more, and two of Bullet's seats go empty. They need to:

- share one vehicle and each pay a **fair individual fare**;
- see **only their own** ride details;
- let Jashim see exactly who is riding and which stage the trip is at.

When **Shirin** tries for the last seat, the app must never overbook Bullet. After every ride, the history must explain what happened.

## Features implemented

**Passenger**
- Sign up / log in (JWT, bcrypt-hashed passwords).
- Fare estimate before booking: the solo fare, plus the pooled fare when an open pool can take you.
- Request a ride: you **auto-join** an open pool in your pickup zone, or wait as `REQUESTED` for the driver.
- "My ride": progress bar, driver + vehicle, **my own fare** with its breakdown, "Shared with N other passengers", cancel before the driver arrives. It refreshes every 5 s.
- Ride history (completed and cancelled), newest first.

**Driver (Jashim)**
- Go online / offline (you can't go offline during a trip).
- See only the waiting requests you can actually accept, then accept one: this creates a pool or adds to the open one.
- Current trip: passengers (first name, drop-off, seats, fare for cash), seat counter **2 / 3 seats**, one next-step button.
- Trip history with passengers and total fare.

**System**
- Seats can never exceed capacity, even under simultaneous requests (one atomic SQL `UPDATE` + a `CHECK` constraint).
- Every status or fare change is written to `ride_events` in the same transaction.
- Every screen that loads data has loading, error (with retry) and empty states.
- One command: `docker compose up --build` (db → api with migrations + seed → web).

## Screenshots

<!-- SCREENSHOTS -->

## Architecture

The browser loads pages from Next.js and calls the NestJS API **directly** with the JWT. Only the API talks to the database. Details and all diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```mermaid
flowchart LR
  B["Browser<br/>Nusrat · Rafiq · Shirin · Jashim"]
  subgraph DOCKER["docker compose up"]
    direction LR
    W["Next.js<br/>web :3000"]
    A["NestJS API<br/>api :4000<br/>Auth · Rides · Driver · Fare"]
    D[("PostgreSQL 16<br/>db :5432<br/>5 tables")]
  end
  B -- "loads pages" --> W
  B -- "fetch + JWT (CORS: WEB_ORIGIN only)" --> A
  A -- "SQL via TypeORM" --> D
```

## Database (ERD)

Five tables: `users`, `vehicles`, `pools`, `ride_requests`, `ride_events`. Full columns, constraints and indexes: [docs/ERD.md](docs/ERD.md).

![ERD](docs/ERD.png)

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 11 (REST, prefix `/api/v1`), class-validator, passport-jwt, bcrypt |
| Database | PostgreSQL 16, TypeORM 1.x with migrations (`synchronize: false`) |
| Tests | Jest + supertest, e2e against a real Postgres test database |
| Runtime | Docker Compose (3 containers with health checks), Node 24 |

## Project structure

```
dhaka-tesla-pool/
├── apps/
│   ├── api/                  NestJS API
│   │   ├── src/
│   │   │   ├── auth/         signup, login, JWT, roles guard
│   │   │   ├── rides/        request, cancel, history, PoolingService (claimSeat), state machine
│   │   │   ├── driver/       online/offline, accept, arrive → start → complete, history
│   │   │   ├── fare/         pure fare math (paisa)
│   │   │   ├── database/     entities, migrations, seed
│   │   │   └── common/       error filter, request logger
│   │   ├── test/             e2e tests (T1–T6) against Postgres
│   │   └── Dockerfile
│   └── web/                  Next.js app
│       ├── app/              pages: login, signup, (passenger)/ride/*, rides, driver/*
│       ├── components/       Button, Card, Spinner, EmptyState, ErrorState, StatusBadge, …
│       ├── lib/              api.ts (fetch + JWT), auth.tsx, money.ts (formatTaka)
│       └── Dockerfile
├── docs/                     PRD, ARCHITECTURE, ERD, DECISIONS, SCALING, AI_LOG, api/demo.http
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- For running outside Docker: Node.js 24 and npm 11

## Environment variables

Copy `.env.example` to `.env`. The values are placeholders; never commit `.env`.

| Variable | Used by | Example | Meaning |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | `teslapool` / `changeme` / `teslapool` | Database the db container creates |
| `DB_PORT` | compose | `5432` | Port of the db container **on your machine** (see below) |
| `DATABASE_URL` | api (local run) | `postgres://teslapool:changeme@localhost:5432/teslapool` | In Docker, compose builds it with host `db` |
| `JWT_SECRET` | api | long random string | Signs login tokens |
| `JWT_EXPIRES_IN` | api | `1h` | Token lifetime |
| `WEB_ORIGIN` | api | `http://localhost:3000` | The only browser origin allowed by CORS |
| `NEXT_PUBLIC_API_URL` | web (build time) | `http://localhost:4000/api/v1` | Where the browser finds the API. Public, never a secret |
| `TEST_DATABASE_URL` | tests | `…/teslapool_test` | e2e database. Must end in `_test`; created and emptied automatically |

## Run it with Docker (recommended)

```bash
git clone https://github.com/zobayer-hosen/dhaka-tesla-pool.git
cd dhaka-tesla-pool
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1 (health: `/api/v1/health`)

Start from an empty database with `docker compose down -v && docker compose up --build`.

### Port 5432 already in use? (common on Windows)

If PostgreSQL is already installed on your machine, it owns port **5432**. The db container then can't publish that port, or your local tools reach the **wrong** Postgres and fail with `role "teslapool" does not exist`. Fix it without stopping your own Postgres:

1. In `.env`, set `DB_PORT=5433`.
2. Change the port in `DATABASE_URL` and `TEST_DATABASE_URL` to `5433` too (they are used from your machine).
3. `docker compose down && docker compose up --build`.

Containers still talk to each other on `db:5432`. Only the port on your machine changes.

## Migrations and seed

In Docker this happens automatically on every api start: `migration:run` → `seed` (safe to repeat) → start. To run it by hand against the database in `DATABASE_URL`:

```bash
npm install
npm run migration:run -w apps/api
npm run seed -w apps/api
```

## Run web, api and tests without Docker for the apps

```bash
npm install
docker compose up -d db          # only the database
npm run dev:api                  # http://localhost:4000
npm run dev:web                  # http://localhost:3000
```

**Tests** (need the db container running; they create and use `teslapool_test`, never your dev data):

```bash
npm test -w apps/api             # unit + e2e, including T1–T6
npm run lint                     # ESLint (type-aware) + Prettier
```

The backend can also be driven without any UI: [docs/api/demo.http](docs/api/demo.http) runs the whole demo (VS Code REST Client).

## Demo credentials

Demo-only passwords, seeded automatically.

| Name | Email | Password | Role |
|---|---|---|---|
| Jashim | `jashim@teslapool.dev` | `password123` | Driver (Bullet, 3 seats) |
| Nusrat | `nusrat@teslapool.dev` | `password123` | Passenger |
| Rafiq | `rafiq@teslapool.dev` | `password123` | Passenger |
| Shirin | `shirin@teslapool.dev` | `password123` | Passenger |

## Deployment

**The delivery is the reproducible Docker deployment:** `cp .env.example .env && docker compose up --build` starts the whole system (db, api with migrations and seed, web) with health checks on any machine with Docker.

Why no public URL: free hosting tiers typically put idle containers to sleep (the first request then takes a long time, and the 5-second polling shows errors meanwhile) or limit how long a free Postgres lives, and setting up three hosts didn't fit this release's time box. The brief allows a documented Docker fallback, and one command that always works is more useful to an evaluator than a URL that may be asleep. Deploying needs no code change: the API reads `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` and `PORT` from the environment, and the web image takes `NEXT_PUBLIC_API_URL` as a build argument.

## API overview

REST, prefix `/api/v1`. Errors always look like `{ "statusCode": 409, "code": "POOL_FULL", "message": "This ride just filled up" }`.

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

## Matching rule

Two requests can share a pool when they have the **same pickup zone**, the driver **hasn't arrived yet** (pool still `MATCHED`), and there are **enough free seats**. Drop-off zones may differ. It is simple, explainable, and covers Nusrat and Rafiq's "overlapping but not identical" trip. Route-aware matching is a next improvement.

## Fare model

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

Nusrat sees 100 taka while alone, and 85 taka once Rafiq joins. The fare is **locked when the trip starts**. If Rafiq cancels before that, Nusrat goes back to 100.

## Money storage

All amounts are **integers in paisa** (85 taka = `8500`), in the database, the API and the tests. Floats can't store money exactly (`0.1 + 0.2 = 0.30000000000000004`); integers are exact and easy to compare. The pool discount is rounded **down** to a whole paisa. The browser only formats (`formatTaka(8500)` → `৳85.00`) and never calculates a fare. A `CHECK` constraint makes sure every saved fare adds up: `fare = (base + distance − discount) × seats`.

## Concurrency handling

**The last seat.** Bullet has 1 seat left, and Nusrat and Shirin book at the same instant. If the code read "1 free" and then wrote "+1", both could read before either writes, and 4 people would end up in a 3-seat car. So the check and the change are **one SQL statement**:

```sql
UPDATE pools SET seats_taken = seats_taken + :seats
WHERE id = :poolId AND status = 'MATCHED' AND seats_taken + :seats <= capacity;
-- 1 row changed = got the seat · 0 rows = full
```

Postgres locks the row for the first update and re-checks the `WHERE` for the second, which then changes 0 rows. The losing request is **not lost**: it was saved first in the same transaction, stays `REQUESTED`, and the API still answers `201`. Only a driver accept turns "0 rows" into `409 POOL_FULL`. A `CHECK (seats_taken BETWEEN 0 AND capacity)` is the safety net.

**Other races.** Every status change is a conditional update (`… WHERE id = :id AND status = :expected`; 0 rows → `409`). Every transaction that touches a pool locks the pool row **first** (`SELECT … FOR UPDATE`), so "Rafiq cancels" vs "Jashim taps Arrived" waits instead of deadlocking.

**Tested:** T6 fires both requests with `Promise.all` (exactly one `MATCHED`, `seats_taken = 3`), and a 20-round cancel-vs-arrive race checks there is never a deadlock. As a check, we temporarily replaced the atomic update with load → `+=` → `save()`: 19 of 20 rounds overbooked Bullet.

## Key decisions and trade-offs

From [docs/DECISIONS.md](docs/DECISIONS.md):

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
| Cash only, drivers seeded | Out of the story's scope | No payments, no driver onboarding |
| Whole pool completes at once | One lifecycle, easy to explain | No per-passenger drop-off yet |

## Technology choices

| | Picked | Realistic alternatives | Why it fits a ride-pooling MVP | What would make us switch |
|---|---|---|---|---|
| Database | PostgreSQL 16 | MySQL, MongoDB | Transactions, row locks, `CHECK` constraints and partial unique indexes protect seats and money inside the database | Location data at huge scale → add a geo/in-memory store next to it, not instead of it |
| ORM | TypeORM | Prisma, Drizzle, raw `pg` | Official NestJS module, transactions + QueryBuilder for the atomic `UPDATE`, generated migrations | If typed query results mattered more than NestJS integration → Drizzle/Prisma |
| Backend | NestJS | Express, Fastify, Spring | Modules, guards, pipes and DI give auth, validation and roles with little glue | A tiny service → plain Fastify; a Java team → Spring |
| Auth | JWT (passport-jwt) + bcrypt | Sessions, OAuth provider | Stateless API called directly from the browser; simple to test | Production → httpOnly cookie or an identity provider with refresh tokens |
| Validation | class-validator + global `ValidationPipe` | Zod, Joi | Decorators on DTOs, one pipe for every endpoint, unknown fields rejected | Sharing schemas with the frontend → Zod |
| Styling | Tailwind CSS | CSS modules, a UI kit | Clean screens fast, no component library to learn or ship | A design system with many designers → a component library |
| Tests | Jest + supertest | Vitest, Playwright | e2e tests hit the real HTTP API and a real Postgres, where the race conditions live | Browser flows → add Playwright |
| Hosting | Docker Compose | Render/Railway/Fly + Vercel + Neon | Reproducible anywhere with one command | A real launch → managed Postgres + container hosting (see Deployment) |

## Known limitations

- Matching is by pickup zone only, with a fixed zone/distance table (no maps, GPS or ETAs).
- The whole pool completes at once; no per-passenger drop-off.
- Status updates arrive by polling (up to 5 s late).
- The JWT is stored in `localStorage`. An XSS bug could read it; production should use an httpOnly cookie.
- One seeded driver and vehicle; no driver sign-up.
- A completed ride leaves "My ride" (it shows in history); there is no ride-detail screen (the timeline is available at `GET /rides/:id`).
- No public deployment URL (see Deployment).

## Next improvements

1. Per-passenger drop-off (Nusrat gets out at Mohakhali while Rafiq rides on).
2. Route-aware matching (pool by corridor, not only pickup zone).
3. Auto-cancel requests that stay unmatched for 10 minutes.
4. Simulated wallet (TeslaPay).
5. WebSockets instead of polling.
6. Ratings after a completed ride.
7. Public deployment and a Playwright smoke test in CI.

## AI usage

<!-- AI USAGE: written by me -->

## Demo video

<!-- VIDEO LINK -->
