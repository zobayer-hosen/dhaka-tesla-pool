import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp, loginAs, resetDatabase } from './test-app';

interface Ride {
  id: string;
  status: string;
  fare: { farePaisa: number };
  coRiderCount: number;
  driver: unknown;
  cancelledAt: string | null;
}

describe('Rides (e2e)', () => {
  let app: INestApplication<App>;
  let nusrat: string;
  let rafiq: string;
  let jashim: string;

  const bananiToMohakhali = {
    pickupZone: 'BANANI',
    dropoffZone: 'MOHAKHALI',
    seats: 1,
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts from the seeded cast with no rides.
  beforeEach(async () => {
    await resetDatabase(app);
    nusrat = await loginAs(app, 'nusrat');
    rafiq = await loginAs(app, 'rafiq');
    jashim = await loginAs(app, 'jashim');
  });

  function server() {
    return request(app.getHttpServer());
  }

  async function nusratRequestsARide(): Promise<Ride> {
    const response = await server()
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${nusrat}`)
      .send(bananiToMohakhali)
      .expect(201);
    return response.body as Ride;
  }

  function eventsOf(rideId: string) {
    return app
      .get(DataSource)
      .query<{ from_status: string | null; to_status: string }[]>(
        'SELECT from_status, to_status FROM ride_events WHERE ride_request_id = $1 ORDER BY id',
        [rideId],
      );
  }

  describe('zones and estimate', () => {
    it('lists the 8 zones for a logged-in user, 401 without a token', async () => {
      const response = await server()
        .get('/api/v1/zones')
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      expect(response.body).toHaveLength(8);
      expect((response.body as unknown[])[0]).toEqual({
        id: 'BANANI',
        name: 'Banani',
      });

      await server().get('/api/v1/zones').expect(401);
    });

    it('estimates 100 taka for Nusrat and 240 taka for Rafiq with 2 seats', async () => {
      const nusratEstimate = await server()
        .post('/api/v1/rides/estimate')
        .set('Authorization', `Bearer ${nusrat}`)
        .send(bananiToMohakhali)
        .expect(200);
      expect(nusratEstimate.body).toEqual({
        distanceM: 3000,
        seats: 1,
        solo: {
          baseFarePaisa: 4000,
          distanceChargePaisa: 6000,
          poolDiscountPaisa: 0,
          farePaisa: 10000,
        },
        pooled: null,
      });

      const rafiqEstimate = await server()
        .post('/api/v1/rides/estimate')
        .set('Authorization', `Bearer ${rafiq}`)
        .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', seats: 2 })
        .expect(200);
      expect(
        (rafiqEstimate.body as { solo: { farePaisa: number } }).solo.farePaisa,
      ).toBe(24000);
    });
  });

  describe('requesting a ride', () => {
    it('saves Nusrat as REQUESTED with her solo fare and one event', async () => {
      const ride = await nusratRequestsARide();
      expect(ride).toMatchObject({
        status: 'REQUESTED',
        fare: { farePaisa: 10000 },
        coRiderCount: 0,
        driver: null,
      });
      expect(await eventsOf(ride.id)).toEqual([
        { from_status: null, to_status: 'REQUESTED' },
      ]);

      const current = await server()
        .get('/api/v1/rides/current')
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      expect((current.body as Ride).id).toBe(ride.id);
    });

    it('refuses a second active ride → 409 ACTIVE_RIDE_EXISTS', async () => {
      await nusratRequestsARide();
      const response = await server()
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${nusrat}`)
        .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', seats: 1 })
        .expect(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code: 'ACTIVE_RIDE_EXISTS',
        message: 'You already have an active ride',
      });
    });

    it.each([
      [
        'the same pickup and drop-off',
        { pickupZone: 'BANANI', dropoffZone: 'BANANI', seats: 1 },
      ],
      ['4 seats', { ...bananiToMohakhali, seats: 4 }],
      ['0 seats', { ...bananiToMohakhali, seats: 0 }],
      ['an unknown zone', { ...bananiToMohakhali, dropoffZone: 'MOTIJHEEL' }],
    ])('rejects %s → 400 VALIDATION_ERROR', async (_case, body) => {
      const response = await server()
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${nusrat}`)
        .send(body)
        .expect(400);
      expect((response.body as { code: string }).code).toBe('VALIDATION_ERROR');
    });

    it('answers 404 on /rides/current when Nusrat has no active ride', async () => {
      await server()
        .get('/api/v1/rides/current')
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(404);
    });
  });

  describe('privacy and roles (T4)', () => {
    it("gives Rafiq 404 for Nusrat's ride, to read or to cancel", async () => {
      const ride = await nusratRequestsARide();

      const read = await server()
        .get(`/api/v1/rides/${ride.id}`)
        .set('Authorization', `Bearer ${rafiq}`)
        .expect(404);
      expect(read.body).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Ride not found',
      });
      await server()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set('Authorization', `Bearer ${rafiq}`)
        .expect(404);

      // Nusrat's ride is untouched.
      const own = await server()
        .get(`/api/v1/rides/${ride.id}`)
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      expect((own.body as Ride).status).toBe('REQUESTED');
    });

    it('gives Jashim (a driver) 403 on passenger routes', async () => {
      const ride = await nusratRequestsARide();
      const response = await server()
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${jashim}`)
        .send(bananiToMohakhali)
        .expect(403);
      expect((response.body as { code: string }).code).toBe('FORBIDDEN');
      await server()
        .get(`/api/v1/rides/${ride.id}`)
        .set('Authorization', `Bearer ${jashim}`)
        .expect(403);
    });
  });

  describe('cancelling (T5)', () => {
    it('lets Nusrat cancel her REQUESTED ride, with an event row', async () => {
      const ride = await nusratRequestsARide();

      const response = await server()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      expect((response.body as Ride).status).toBe('CANCELLED');
      expect((response.body as Ride).cancelledAt).not.toBeNull();
      expect(await eventsOf(ride.id)).toEqual([
        { from_status: null, to_status: 'REQUESTED' },
        { from_status: 'REQUESTED', to_status: 'CANCELLED' },
      ]);

      // It shows in her history, and she can book again.
      const history = await server()
        .get('/api/v1/rides')
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      expect(history.body).toEqual([
        expect.objectContaining({ id: ride.id, status: 'CANCELLED' }),
      ]);
      await nusratRequestsARide();
    });

    it('refuses to cancel twice → 409 INVALID_TRANSITION', async () => {
      const ride = await nusratRequestsARide();
      await server()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(200);
      const again = await server()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(409);
      expect((again.body as { code: string }).code).toBe('INVALID_TRANSITION');
    });

    it('refuses to cancel after Jashim has arrived → 409', async () => {
      const ride = await nusratRequestsARide();
      // The driver endpoints come later, so put Nusrat in Bullet's pool and mark
      // it DRIVER_ARRIVED directly in the test database.
      const db = app.get(DataSource);
      const [pool] = await db.query<{ id: string }[]>(
        `INSERT INTO pools (vehicle_id, pickup_zone, capacity, seats_taken, status)
         SELECT id, 'BANANI', capacity, 1, 'DRIVER_ARRIVED' FROM vehicles WHERE nickname = 'Bullet'
         RETURNING id`,
      );
      await db.query(
        `UPDATE ride_requests SET pool_id = $1, status = 'DRIVER_ARRIVED' WHERE id = $2`,
        [pool.id, ride.id],
      );

      const response = await server()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set('Authorization', `Bearer ${nusrat}`)
        .expect(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code: 'INVALID_TRANSITION',
        message: "A ride can't go from DRIVER_ARRIVED to CANCELLED",
      });
      expect(await eventsOf(ride.id)).toHaveLength(1);
    });
  });
});
