import { existsSync } from 'node:fs';

// The e2e tests empty their database, so they must never touch the dev database.
// They use TEST_DATABASE_URL, and its database name must end in _test.
export function testDatabaseUrl(): string {
  // npm runs the tests from apps/api, so the shared .env is two folders up.
  // Variables that are already set (e.g. in CI) are not overwritten.
  const envFile = '../../.env';
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  }
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must name a database ending in _test');
  }
  return url;
}
