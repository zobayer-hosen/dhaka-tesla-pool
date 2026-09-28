# AI usage log

One line per notable moment: *"Accepted: …"*, *"Rejected/changed: … because …"*. The README's AI Usage section is written from this log.

## Design phase

- **Changed:** the AI's first architecture had 10 diagrams, 9 tables, a wallet and idempotency keys. I simplified it to 5 tables and cash only, because the brief says not to add complexity without a reason.
- **Changed:** the AI proposed Prisma; I chose TypeORM (reasons in ARCHITECTURE §1).
- **Accepted/Changed:** an AI review (Claude Code) found 7 inconsistencies in the design docs before any code was written (branch name, doc paths, varchar(20) overflow in seed plate, missing EMAIL_TAKEN error code, two ERDs out of sync, missing edit-booking flow, untestable second-driver case). I decided each fix; they were applied before the first commit.

## Build phase

- **Changed:** the "Docker Image CI" workflow I added from GitHub's template built a root `Dockerfile` that doesn't exist, so every run failed. Claude Code spotted the red runs and pointed it at `apps/api/Dockerfile` (`fix/docker-ci`).
