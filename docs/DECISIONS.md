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
7. **Type-aware lint to catch missing `await`s.** A forgotten `await` inside a transaction can run the query after the transaction has ended and lose its error; `@typescript-eslint/no-floating-promises` needs type information to catch it. *Not enabled yet — planned in `fix/type-aware-lint`.*

## Design review (`fix/design-review`, 2026-09-28)

8. **A losing auto-join keeps the request as `REQUESTED`.** `claimSeat` returns `true`/`false` and never throws; `POST /rides` saves the request first and always answers `201`. Why: 0 rows changed is not a SQL error, and throwing would roll back the transaction and lose the request. Only driver accept turns `false` into `409 POOL_FULL`. (ARCHITECTURE §5, PRD §8)
9. **Every status change is a conditional update** (`WHERE id = :id AND status = :expected`; 0 rows → `409`). Why: a cancel and a driver step can race exactly like two seat claims. (ARCHITECTURE §5 "Other status changes")
10. **Lock order: the pool row first (`FOR UPDATE`), then its ride requests.** Why: with the same order everywhere, cancel vs "Arrived" waits instead of deadlocking. (ARCHITECTURE §5)
11. **The pool discount and the co-rider count (`coRiderCount`, "Shared with N") count bookings, not seats.** Why: the discount is for sharing the car with someone else; Rafiq alone with 2 seats pays the solo fare. (PRD §7, §5.1 P4)
12. **A cancelled pool is recorded in the last passenger's `CANCELLED` event note** ("pool cancelled: last passenger left"). Why: events belong to ride requests, and this needs no schema change. (ERD §3, PRD §12)
13. **The browser calls the API directly** with the JWT; Next.js only serves the pages. Why: that is how the web app is built (Step 7: `NEXT_PUBLIC_API_URL`, token in the browser), so no proxy layer is needed. It is also why CORS is limited to `WEB_ORIGIN`. (ARCHITECTURE §1)
14. **PoolingService lives in RidesModule and is exported to DriverModule; `/pools/:id/*` routes belong to DriverModule.** Why: one seat-claiming path, and only the driver moves a pool forward. (ARCHITECTURE §1)
15. **UUID primary keys default to `gen_random_uuid()`, without `uuid-ossp`.** Why: it is built into Postgres 13+, so there is no extension to install. (BUILD_PLAYBOOK Step 2)
