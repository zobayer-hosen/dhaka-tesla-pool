import { EntityManager } from 'typeorm';

// Used by `npm run demo:reset` (demo-reset.ts) and its e2e test.

export interface DemoRowCounts {
  users: number;
  driversOnline: number;
  vehicles: number;
  pools: number;
  rideRequests: number;
  rideEvents: number;
}

// The guard: nothing is deleted unless the person running it typed exactly
// DEMO_RESET=yes. It is checked before connecting to any database.
export function assertResetAllowed(
  env: Record<string, string | undefined>,
): void {
  if (env.DEMO_RESET !== 'yes') {
    throw new Error(
      'Refusing to reset: set DEMO_RESET=yes to delete every ride, pool and ride event.',
    );
  }
}

export async function countDemoRows(
  manager: EntityManager,
): Promise<DemoRowCounts> {
  const [counts] = await manager.query<DemoRowCounts[]>(`
    SELECT
      (SELECT count(*)::int FROM users) AS "users",
      (SELECT count(*)::int FROM users WHERE role = 'DRIVER' AND is_online) AS "driversOnline",
      (SELECT count(*)::int FROM vehicles) AS "vehicles",
      (SELECT count(*)::int FROM pools) AS "pools",
      (SELECT count(*)::int FROM ride_requests) AS "rideRequests",
      (SELECT count(*)::int FROM ride_events) AS "rideEvents"
  `);
  return counts;
}

// Empties the demo's rides: history first, then bookings, then trips, because
// every foreign key is ON DELETE RESTRICT (ERD §6). Users and vehicles stay;
// drivers go offline, so the next demo starts from "Jashim goes online".
// The caller runs it in one transaction: all of it happens, or none of it.
export async function clearDemoRides(manager: EntityManager): Promise<void> {
  await manager.query('DELETE FROM ride_events');
  await manager.query('DELETE FROM ride_requests');
  await manager.query('DELETE FROM pools');
  await manager.query(
    `UPDATE users SET is_online = false WHERE role = 'DRIVER'`,
  );
}
