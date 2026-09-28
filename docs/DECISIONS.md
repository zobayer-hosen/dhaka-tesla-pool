# Dhaka Tesla Pool — Decisions

What we decided and why, in one place. Read this at the start of every session, together with PRD, ARCHITECTURE and ERD. The README's "Key decisions and trade-offs" section is written from this list.

To change a decision, add a new numbered entry that says which one it replaces, and update the docs it points to in the same branch.

## Design phase

1. **TypeORM, not Prisma.** Official NestJS module, transactions + QueryBuilder for the atomic seat `UPDATE`, generated migrations. Prisma adds a separate schema language and a wrapper service. (ARCHITECTURE §1)
2. **Backend first, then frontend.** The whole API is built and tested (T1–T6) before any UI code, so the UI is built against a stable API and never re-implements business rules. (PRD §16)
3. **Cash only.** The brief allows it. The fare is recorded, not processed: no wallet, no payment gateway. (PRD A8)
4. **Match by same pickup zone.** Same pickup zone + pool still `MATCHED` + enough free seats. Simple, explainable, and covers Nusrat and Rafiq; route-aware matching is a next improvement. (PRD A2, §18)
5. **Money is integer paisa.** Floats can't store money exactly; integers are exact and easy to compare in tests. The pool discount is rounded down to a whole paisa. (PRD §7)
6. **Polling every 5 s, not WebSockets.** Simple and enough for a demo; WebSockets would add connection state to manage for no demo benefit. (PRD A9, ARCHITECTURE §7)
7. **Type-aware lint to catch missing `await`s.** A forgotten `await` inside a transaction can run the query after the transaction has ended and lose its error; `@typescript-eslint/no-floating-promises` needs type information to catch it. *Enabled in `fix/type-aware-lint` (`recommendedTypeChecked` + `projectService` in `eslint.config.mjs`); on day one it caught the unawaited `bootstrap()` in `main.ts`.*

## Design review (`fix/design-review`, 2026-09-28)

8. **A losing auto-join keeps the request as `REQUESTED`.** `claimSeat` returns `true`/`false` and never throws; `POST /rides` saves the request first and always answers `201`. Why: 0 rows changed is not a SQL error, and throwing would roll back the transaction and lose the request. Only driver accept turns `false` into `409 POOL_FULL`. (ARCHITECTURE §5, PRD §8)
9. **Every status change is a conditional update** (`WHERE id = :id AND status = :expected`; 0 rows → `409`). Why: a cancel and a driver step can race exactly like two seat claims. (ARCHITECTURE §5 "Other status changes")
10. **Lock order: the pool row first (`FOR UPDATE`), then its ride requests.** Why: with the same order everywhere, cancel vs "Arrived" waits instead of deadlocking. (ARCHITECTURE §5)
11. **The pool discount and the co-rider count (`coRiderCount`, "Shared with N") count bookings, not seats.** Why: the discount is for sharing the car with someone else; Rafiq alone with 2 seats pays the solo fare. (PRD §7, §5.1 P4)
12. **A cancelled pool is recorded in the last passenger's `CANCELLED` event note** ("pool cancelled: last passenger left"). Why: events belong to ride requests, and this needs no schema change. (ERD §3, PRD §12)
13. **The browser calls the API directly** with the JWT; Next.js only serves the pages. Why: that is how the web app is built (Step 7: `NEXT_PUBLIC_API_URL`, token in the browser), so no proxy layer is needed. It is also why CORS is limited to `WEB_ORIGIN`. (ARCHITECTURE §1)
14. **PoolingService lives in RidesModule and is exported to DriverModule; `/pools/:id/*` routes belong to DriverModule.** Why: one seat-claiming path, and only the driver moves a pool forward. (ARCHITECTURE §1)
15. **UUID primary keys default to `gen_random_uuid()`, without `uuid-ossp`.** Why: it is built into Postgres 13+, so there is no extension to install. (BUILD_PLAYBOOK Step 2)
16. **All application code, tests and scripts are TypeScript; config files may stay in the tool's default format** (`eslint.config.mjs`, `postcss.config.mjs`). Why: one language for everything we write and explain, without adding a loader like `jiti` just to read a TypeScript config. (CLAUDE.md "Stack")
17. **The agent opens and merges its own PRs** with `gh pr merge --merge` (merge commit only), and only when lint, tests and the step's "Verify yourself" checks pass. Each PR explains the change simply and answers the step's "understand" questions. Why: the project runs end to end with check-ins only at the checkpoints, and the PRs become study material. (CLAUDE.md "Git rules", BUILD_PLAYBOOK "Git rules for every step")

## Build phase

18. **Migrations and the seed run as compiled JavaScript.** `npm run migration:*` and `npm run seed` build first and run the files in `dist/`; the Docker image runs the same files on every start (migrations → seed → API). Migrations are listed one by one in `database.config.ts`, not found with a file glob. Why: local runs and Docker run the same code, no TypeScript loader (`ts-node`) is needed to read a TypeScript data source, and the app, the CLI and the tests always load the same migrations. (BUILD_PLAYBOOK Step 2)
19. **Stay on NestJS 11 and its CommonJS modules** (`@nestjs/typeorm` 11, `@nestjs/jwt` 11, `@nestjs/passport` 11). Why: the 12.x releases belong to NestJS 12 and are ES modules; mixed with our NestJS 11 core they only load because Node 24 can `require()` ES modules, and Jest can't, so the first e2e test failed. (`feature/passenger-auth`)
20. **e2e tests use their own database, `TEST_DATABASE_URL`, whose name must end in `_test`.** Jest's global setup creates it on the same Postgres and runs the real migrations; each test file empties it and re-adds the cast. The `_test` name is checked twice (before connecting and before emptying), so tests can never wipe the dev database. Tests run one file at a time (`--runInBand`) because they share it. (BUILD_PLAYBOOK Step 3)
21. **Sign-up logs the passenger in**: `POST /auth/signup` returns the same `{ accessToken, user }` as login. Why: the web app can go straight to booking; the PRD doesn't say what sign-up returns. (PRD §11)
22. **Unexpected errors return `500 INTERNAL_ERROR` "Something went wrong"**; the stack trace goes only to the logs. Why: every error keeps the `{ statusCode, code, message }` shape, and PRD §11 lists codes only for expected errors. (PRD §11, §13)
23. **`GET /rides/current` answers `404 NOT_FOUND` "You have no active ride" when there is none.** Why: every response keeps one shape (a ride or an error); the web app shows the "No active ride — book one" empty state on `NOT_FOUND`. (PRD §10–11)
24. **`GET /rides` (history) lists only completed and cancelled rides**, newest first; the active ride lives at `GET /rides/current`. (PRD P6)
25. **A ride's timeline says who acted as `YOU`, `DRIVER` or `SYSTEM`**, never a name or user id, so it can't reveal another passenger. (PRD §9, §12)
26. **Fare-change notes are three fixed texts that name nobody**: "Another passenger joined, pool discount applied" (riders already in the pool), "Joined a shared ride, pool discount applied" (the booking that joined) and "Now riding alone, pool discount removed". Auto-join and fare changes have no actor (`actor_id` NULL = the system). (PRD §9, ERD §3)
27. **The estimate shows a pooled fare only when an open pool in the pickup zone already has a booking and room for the seats**, because only then does joining make 2+ bookings. Otherwise `pooled` is `null`. (PRD P2, §7)
28. **`GET /driver/status` returns `{ online }`.** It is not in PRD §11: `PATCH /driver/status` is, but the web app also needs to read the current value to draw the online toggle. *Added in `feature/driver-flow`; waiting for approval at the backend checkpoint before PRD §11 is updated.*
29. **`GET /driver/pool` answers `404 NOT_FOUND` "You have no active trip" when there is none**, like `GET /rides/current` (#23). The web app shows "No active trip" on `NOT_FOUND`. (PRD §10)
30. **Accept answers `200` with the driver's trip**, and two "first" accepts at the same moment can't create two pools for Bullet: `uq_pools_active_vehicle` refuses the second, which becomes `409 POOL_NOT_JOINABLE` ("Your trip just changed, please try again"). (PRD D3, §11)
