import dataSource from './data-source';
import { assertResetAllowed, clearDemoRides, countDemoRows } from './demo-data';

// `DEMO_RESET=yes npm run demo:reset -w apps/api`: deletes every ride, pool and
// ride event in the database in DATABASE_URL, keeps users and vehicles, and
// sends drivers offline. Prints the row counts before and after.
async function reset(): Promise<void> {
  // Before connecting: without DEMO_RESET=yes nothing is touched.
  assertResetAllowed(process.env);

  // Which database, without printing the URL (it contains the password).
  const url = new URL(process.env.DATABASE_URL ?? '');
  const host = url.hostname.endsWith('.neon.tech')
    ? '*.neon.tech'
    : url.hostname;

  await dataSource.initialize();
  const [{ name }] = await dataSource.query<{ name: string }[]>(
    'SELECT current_database() AS name',
  );
  console.log(`Target: database "${name}" on ${host}`);
  console.log('Before:', await countDemoRows(dataSource.manager));

  await dataSource.transaction((manager) => clearDemoRides(manager));

  console.log('After: ', await countDemoRows(dataSource.manager));
  await dataSource.destroy();
}

reset().catch((error: unknown) => {
  console.error(
    'Demo reset failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
