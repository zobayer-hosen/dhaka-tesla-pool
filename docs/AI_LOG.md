# AI usage log

One line per notable moment: *"Accepted: …"*, *"Rejected/changed: … because …"*. The README's AI Usage section is written from this log.

## Design phase

- **Changed:** the AI's first architecture had 10 diagrams, 9 tables, a wallet and idempotency keys. I simplified it to 5 tables and cash only, because the brief says not to add complexity without a reason.
- **Changed:** the AI proposed Prisma; I chose TypeORM (reasons in ARCHITECTURE §1).
- **Accepted/Changed:** an AI review (Claude Code) found 7 inconsistencies in the design docs before any code was written (branch name, doc paths, varchar(20) overflow in seed plate, missing EMAIL_TAKEN error code, two ERDs out of sync, missing edit-booking flow, untestable second-driver case). I decided each fix; they were applied before the first commit.
- **Accepted/Changed:** a second AI design review (`fix/design-review`) found that a passenger losing the last-seat race would have her request rolled back and lost, that cancel vs "Arrived" could deadlock, and that the pool discount counted seats instead of bookings. I approved the fixes (`claimSeat` returns a boolean, conditional status updates with a fixed lock order, count bookings) and had every decision written down in `docs/DECISIONS.md`.

## Build phase

- **Changed:** the "Docker Image CI" workflow I added from GitHub's template built a root `Dockerfile` that doesn't exist, so every run failed. Claude Code spotted the red runs and pointed it at `apps/api/Dockerfile` (`fix/docker-ci`).
- **Accepted:** the AI suggested type-aware lint (`recommendedTypeChecked`) so a missing `await` inside a transaction becomes a lint error. Turning it on immediately found a real one: `bootstrap()` in `main.ts` was never awaited or handled. Fixed with `void bootstrap();` in its own commit.
- **Accepted:** on my machine a Windows PostgreSQL service already listens on 5432, so `localhost:5432` never reached the Docker db ("role does not exist"). Instead of stopping my service, the AI made the host port configurable (`DB_PORT`, default 5432) and I use 5433 locally (`fix/db-host-port`).
- **Changed:** the migration TypeORM generated created the shared `zone` and `request_status` enums twice (it would have failed on a fresh database) and couldn't express `created_at DESC` for the history index. I had it fixed by hand, then proved the entities and the SQL still agree: `migration:generate` afterwards reports "No changes".
- **Accepted:** run migrations and the seed from the compiled `dist/` files instead of adding `ts-node` just to read a TypeScript data source (DECISIONS #18).
- **Changed:** the AI first installed `@nestjs/typeorm`, `@nestjs/jwt` and `@nestjs/passport` 12.x. The app still started, but the first e2e test showed they are ES modules meant for NestJS 12; we pinned the NestJS 11 releases (DECISIONS #19). Kept as an honest `fix(api)` commit.
- **Accepted:** while testing login by hand, the AI noticed a wrong password took ~127 ms but an unknown email ~3 ms, which reveals who has an account even though the message is the same. Login now also runs bcrypt against a dummy hash when the email doesn't exist.
- **Changed:** one e2e run failed once and then passed 11 times. Instead of re-running until green, the AI reproduced it under CPU load: each test's setup (empty the database, re-seed the cast, log in three people, all with bcrypt) sometimes took longer than Jest's 5-second default. The e2e timeout is now 30 s; no assertion was changed.
- **Broke it on purpose (Step 5 check):** `claimSeat` was temporarily replaced with load → `seatsTaken += seats` → `save()`, and T6's last-seat race ran 20 times. In **19 of 20** rounds both Nusrat and Shirin got `MATCHED`: 4 seats booked in 3-seat Bullet, while `seats_taken` still said 3, because both read 2 and both wrote 3 (a lost update). The `ck_pools_seats` CHECK never fired, since no single write went above capacity; it can't see the sum of the passengers' seats (ERD §6). Reverted: with the single conditional `UPDATE`, T6 passes 20 of 20 every run.
