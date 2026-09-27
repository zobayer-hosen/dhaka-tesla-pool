# Project rules for AI assistants — Dhaka Tesla Pool

## Source of truth
Read docs/PRD.md, docs/ARCHITECTURE.md and docs/ERD.md before any work.
If you must deviate from them, STOP and ask me. If I approve, update the doc in the same branch.

## Stack (fixed — do not add or swap)
- Monorepo with npm workspaces: apps/api (NestJS), apps/web (Next.js App Router, TypeScript, Tailwind)
- PostgreSQL 16, TypeORM with migrations. `synchronize: false` ALWAYS.
- Auth: @nestjs/jwt + passport-jwt, bcrypt. Validation: class-validator + global ValidationPipe.
- Tests: Jest + supertest (api). e2e tests run against a real Postgres test database.
- NOT allowed: Prisma, Redis, queues, Kafka, WebSockets, microservices, GraphQL, extra UI kits.

## Domain rules (never break)
- Cast everywhere (seed, tests, examples): Jashim (driver), Bullet (vehicle, capacity 3), Nusrat, Rafiq, Shirin. Never user1/driver1/foo.
- Money = integer paisa. Never float, never decimal for arithmetic.
- Seat claiming = ONE conditional SQL UPDATE (`... WHERE seats_taken + :seats <= capacity`) inside a transaction.
  NEVER load a pool, change seatsTaken in JS and save() it.
- Every status or fare change writes a ride_events row in the SAME transaction.
- Passengers see only their own rides: return 404 for other people's rides. Wrong role returns 403.
- ride_events notes never name another passenger ("Another passenger joined", not "Rafiq joined").
- Error body shape: { statusCode, code, message }. Codes listed in PRD §11.

## Git rules
- Work ONLY on the branch I have checked out (feature/*, fix/* or pre-release). Never commit to master or release/*, never merge, never push, never rewrite history.
- Commit format: <type>(<scope>): <short description>. Types: feat, fix, refactor, test, docs, chore, build.
- One logical change per commit. 3–6 commits per step. No vague messages (update, changes, fix, final, wip).
- Never commit .env or any secret. Only .env.example with placeholder values.

## How to work
- Keep code simple and readable; I must explain every line in an interview. No clever abstractions.
- Add a short comment only where the "why" isn't obvious (e.g. the atomic seat UPDATE).
- Run lint and tests before each commit. Don't commit failing tests.
- At the end of each task reply with: (1) commits made, (2) how I can verify, (3) any assumption you made, (4) anything you were unsure about.
