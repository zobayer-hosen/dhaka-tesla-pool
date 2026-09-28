import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/database.config';
import { testDatabaseUrl } from './test-env';

// Runs once before all e2e tests: creates the test database if it doesn't exist
// yet, then brings it up to date with the same migrations production runs.
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const databaseName = new URL(url).pathname.slice(1);

  // CREATE DATABASE has to run while connected to another database.
  const serverUrl = new URL(url);
  serverUrl.pathname = '/postgres';
  const server = new Client({ connectionString: serverUrl.toString() });
  await server.connect();
  const existing = await server.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [databaseName],
  );
  if (existing.rowCount === 0) {
    await server.query(`CREATE DATABASE "${databaseName}"`);
  }
  await server.end();

  const dataSource = new DataSource(databaseOptions(url));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
