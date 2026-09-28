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
