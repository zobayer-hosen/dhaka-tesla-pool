import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { seedCast } from '../src/database/seed-cast';

export type CastMember = 'jashim' | 'nusrat' | 'rafiq' | 'shirin';

// The real AppModule against the real test database, set up exactly like main.ts
// (prefix, validation, error format). logger: false keeps test output readable.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

// A second guard (after test-env.ts) against ever emptying the dev database.
async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const [{ name }] = await dataSource.query<{ name: string }[]>(
    'SELECT current_database() AS name',
  );
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to empty "${name}": not a _test database`);
  }
}

// Empties every table, then adds the demo cast (unless withCast is false).
// Checks the database name first: a second guard against wiping the dev database.
export async function resetDatabase(
  app: INestApplication<App>,
  { withCast = true } = {},
): Promise<void> {
  const dataSource = app.get(DataSource);
  await assertTestDatabase(dataSource);
  await dataSource.query(
    'TRUNCATE ride_events, ride_requests, pools, vehicles, users RESTART IDENTITY CASCADE',
  );
  if (withCast) {
    await seedCast(dataSource.manager);
  }
}

// Empties only the ride tables and keeps the cast, so login tokens stay valid.
// Cheaper than resetDatabase when a test repeats a scenario many times.
export async function clearRides(app: INestApplication<App>): Promise<void> {
  await assertTestDatabase(app.get(DataSource));
  await app
    .get(DataSource)
    .query('TRUNCATE ride_events, ride_requests, pools RESTART IDENTITY');
}

// An open (MATCHED, empty) pool for Bullet, made directly in the database,
// because the driver's accept endpoint comes in a later step.
export async function createOpenPoolForBullet(
  app: INestApplication<App>,
  pickupZone = 'BANANI',
): Promise<string> {
  const [pool] = await app.get(DataSource).query<{ id: string }[]>(
    `INSERT INTO pools (vehicle_id, pickup_zone, capacity)
     SELECT id, $1, capacity FROM vehicles WHERE nickname = 'Bullet'
     RETURNING id`,
    [pickupZone],
  );
  return pool.id;
}

export async function seatsTaken(
  app: INestApplication<App>,
  poolId: string,
): Promise<number> {
  const [pool] = await app
    .get(DataSource)
    .query<{ seats_taken: number }[]>(
      'SELECT seats_taken FROM pools WHERE id = $1',
      [poolId],
    );
  return pool.seats_taken;
}

// Logs in one of the cast with the demo password (PRD §14); returns the token.
export async function loginAs(
  app: INestApplication<App>,
  who: CastMember,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: `${who}@teslapool.dev`, password: 'password123' })
    .expect(200);
  return (response.body as { accessToken: string }).accessToken;
}
