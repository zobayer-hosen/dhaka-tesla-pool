import { defineConfig } from "@neon/config/v1";

// Neon CLI policy (`neon config plan` / `neon deploy`). It declares no extra Neon
// services: the app only uses Neon Postgres, and its schema changes only through
// TypeORM migrations (docs/deployment.md). Services left out are left alone.
export default defineConfig({});
