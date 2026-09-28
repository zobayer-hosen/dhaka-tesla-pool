import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  clearRides,
  createOpenPoolForBullet,
  createTestApp,
  loginAs,
  resetDatabase,
  seatsTaken,
} from './test-app';

const ROUNDS = 20;

// T6 (PRD §8, ARCHITECTURE §5): the last-seat race on a real Postgres.
describe('The last seat (e2e, T6)', () => {
  let app: INestApplication<App>;
  let nusrat: string;
  let rafiq: string;
  let shirin: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    nusrat = await loginAs(app, 'nusrat');
    rafiq = await loginAs(app, 'rafiq');
    shirin = await loginAs(app, 'shirin');
  });

  afterAll(async () => {
    await app.close();
  });

  function requestOneSeat(token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', seats: 1 });
  }

  it(`gives the last seat to exactly one of Nusrat and Shirin, ${ROUNDS} times in a row`, async () => {
    for (let round = 1; round <= ROUNDS; round++) {
      await clearRides(app);
      const poolId = await createOpenPoolForBullet(app);

      // Rafiq holds 2 of Bullet's 3 seats.
      await request(app.getHttpServer())
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${rafiq}`)
        .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', seats: 2 })
        .expect(201);
      expect(await seatsTaken(app, poolId)).toBe(2);

      // Nusrat and Shirin ask for the last seat at the same moment.
      const [nusratResponse, shirinResponse] = await Promise.all([
        requestOneSeat(nusrat),
        requestOneSeat(shirin),
      ]);

      // Both requests are saved (201); exactly one got the seat.
      expect([nusratResponse.status, shirinResponse.status]).toEqual([
        201, 201,
      ]);
      const statuses = [
        (nusratResponse.body as { status: string }).status,
        (shirinResponse.body as { status: string }).status,
      ].sort();
      expect(statuses).toEqual(['MATCHED', 'REQUESTED']);

      // Never a 4th seat, and the loser's request is kept for Jashim, not lost.
      expect(await seatsTaken(app, poolId)).toBe(3);
      const waiting = await app
        .get(DataSource)
        .query<{ count: string }[]>(
          `SELECT count(*) FROM ride_requests WHERE status = 'REQUESTED' AND pool_id IS NULL`,
        );
      expect(waiting[0].count).toBe('1');
    }
  });
});
