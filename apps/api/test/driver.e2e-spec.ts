import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  clearRides,
  createTestApp,
  loginAs,
  resetDatabase,
  seatsTaken,
} from './test-app';

interface Ride {
  id: string;
  status: string;
  fare: { farePaisa: number };
}

interface Trip {
  id: string;
  status: string;
  seatsTaken: number;
  capacity: number;
  passengers: { firstName: string; seats: number; farePaisa: number }[];
  totalFarePaisa: number;
}

const toMohakhali = { pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI' };
const toGulshan1 = { pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1' };

describe('Driver (e2e)', () => {
  let app: INestApplication<App>;
  let jashim: string;
  let nusrat: string;
  let rafiq: string;
  let shirin: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    jashim = await loginAs(app, 'jashim');
    nusrat = await loginAs(app, 'nusrat');
    rafiq = await loginAs(app, 'rafiq');
    shirin = await loginAs(app, 'shirin');
  });

  afterAll(async () => {
    await app.close();
  });

  // Each test: no rides or trips, and Jashim offline.
  beforeEach(async () => {
    await clearRides(app);
    await app.get(DataSource).query('UPDATE users SET is_online = false');
  });

  function server() {
    return request(app.getHttpServer());
  }

  async function goOnline(): Promise<void> {
    await server()
      .patch('/api/v1/driver/status')
      .set('Authorization', `Bearer ${jashim}`)
      .send({ online: true })
      .expect(200, { online: true });
  }

  async function requestRide(
    token: string,
    body: { pickupZone: string; dropoffZone: string; seats: number },
  ): Promise<Ride> {
    const response = await server()
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return response.body as Ride;
  }

  function accept(rideId: string) {
    return server()
      .post(`/api/v1/driver/requests/${rideId}/accept`)
      .set('Authorization', `Bearer ${jashim}`);
  }

  function step(poolId: string, action: 'arrive' | 'start' | 'complete') {
    return server()
      .post(`/api/v1/pools/${poolId}/${action}`)
      .set('Authorization', `Bearer ${jashim}`);
  }

  function cancel(token: string, rideId: string) {
    return server()
      .post(`/api/v1/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function get<T>(token: string, path: string): Promise<T> {
    const response = await server()
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as T;
  }

  it('runs the Banani rush-hour demo from PRD §14, end to end', async () => {
    // 1. Jashim goes online.
    await goOnline();

    // 2. Nusrat requests Banani → Mohakhali: 100 taka, waiting.
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    expect(nusratRide).toMatchObject({
      status: 'REQUESTED',
      fare: { farePaisa: 10000 },
    });
    expect(await get(jashim, '/driver/requests')).toEqual([
      expect.objectContaining({
        id: nusratRide.id,
        passengerFirstName: 'Nusrat',
        seats: 1,
        farePaisa: 10000,
      }),
    ]);

    // 3. Jashim accepts: a new pool, 1 of 3 seats.
    const accepted = await accept(nusratRide.id).expect(200);
    const poolId = (accepted.body as Trip).id;
    expect(accepted.body).toMatchObject({
      status: 'MATCHED',
      seatsTaken: 1,
      capacity: 3,
    });

    // 4. Rafiq requests Banani → Gulshan 1 and auto-joins: 2 of 3 seats.
    //    Nusrat drops to 85 taka, Rafiq pays 100.
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    expect(rafiqRide).toMatchObject({
      status: 'MATCHED',
      fare: { farePaisa: 10000 },
    });
    expect(await seatsTaken(app, poolId)).toBe(2);
    expect((await get<Ride>(nusrat, '/rides/current')).fare.farePaisa).toBe(
      8500,
    );

    // 5. Shirin wants 2 seats; only 1 is left, so she waits (and Jashim's list
    //    doesn't offer her request: it can't fit).
    const shirinTwoSeats = await requestRide(shirin, {
      ...toGulshan1,
      seats: 2,
    });
    expect(shirinTwoSeats.status).toBe('REQUESTED');
    expect(await get(jashim, '/driver/requests')).toEqual([]);

    // 6. She cancels and books again with 1 seat: 3 of 3, Bullet is full.
    await cancel(shirin, shirinTwoSeats.id).expect(200);
    const shirinRide = await requestRide(shirin, { ...toGulshan1, seats: 1 });
    expect(shirinRide.status).toBe('MATCHED');

    // 7. Nusrat can't read Rafiq's ride.
    await server()
      .get(`/api/v1/rides/${rafiqRide.id}`)
      .set('Authorization', `Bearer ${nusrat}`)
      .expect(404);

    const trip = await get<Trip>(jashim, '/driver/pool');
    expect(trip).toMatchObject({ seatsTaken: 3, totalFarePaisa: 28500 });
    expect(trip.passengers.map((p) => [p.firstName, p.farePaisa])).toEqual([
      ['Nusrat', 8500],
      ['Rafiq', 10000],
      ['Shirin', 10000],
    ]);

    // 8. Arrived → Start → Complete.
    await step(poolId, 'arrive').expect(200);
    await step(poolId, 'start').expect(200);
    const completed = await step(poolId, 'complete').expect(200);
    expect(completed.body).toMatchObject({ status: 'COMPLETED' });

    // Everyone sees COMPLETED, and the history explains what happened.
    for (const token of [nusrat, rafiq, shirin]) {
      const history = await get<{ status: string }[]>(token, '/rides');
      expect(history[0].status).toBe('COMPLETED');
    }
    const { timeline } = await get<{
      timeline: Record<string, unknown>[];
    }>(nusrat, `/rides/${nusratRide.id}`);
    expect(
      timeline.map((e) => [
        e.type,
        e.fromStatus,
        e.toStatus,
        e.newFarePaisa,
        e.actor,
        e.note,
      ]),
    ).toEqual([
      ['STATUS_CHANGED', null, 'REQUESTED', null, 'YOU', null],
      [
        'STATUS_CHANGED',
        'REQUESTED',
        'MATCHED',
        null,
        'DRIVER',
        'Accepted by the driver, new pool created',
      ],
      [
        'FARE_CHANGED',
        null,
        null,
        8500,
        'SYSTEM',
        'Another passenger joined, pool discount applied',
      ],
      ['STATUS_CHANGED', 'MATCHED', 'DRIVER_ARRIVED', null, 'DRIVER', null],
      [
        'STATUS_CHANGED',
        'DRIVER_ARRIVED',
        'STARTED',
        null,
        'DRIVER',
        'Fare locked',
      ],
      ['STATUS_CHANGED', 'STARTED', 'COMPLETED', null, 'DRIVER', null],
    ]);

    const history = await get<Trip[]>(jashim, '/driver/history');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: 'COMPLETED',
      totalFarePaisa: 28500,
    });

    // The trip is over, so he may go offline again.
    await server()
      .patch('/api/v1/driver/status')
      .set('Authorization', `Bearer ${jashim}`)
      .send({ online: false })
      .expect(200, { online: false });
  });

  it('moves all 3 passengers through arrive, start and complete, one event each per step', async () => {
    // Bullet filled the way demo.http fills it: Nusrat (accepted), Rafiq
    // (auto-join), then Shirin's 2-seat request cancelled and rebooked with 1.
    await goOnline();
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const poolId = ((await accept(nusratRide.id).expect(200)).body as Trip).id;
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    const shirinTwoSeats = await requestRide(shirin, {
      ...toGulshan1,
      seats: 2,
    });
    await cancel(shirin, shirinTwoSeats.id).expect(200);
    const shirinRide = await requestRide(shirin, { ...toGulshan1, seats: 1 });
    expect(await seatsTaken(app, poolId)).toBe(3);

    const riders = [nusratRide.id, rafiqRide.id, shirinRide.id].sort();
    const dataSource = app.get(DataSource);
    const steps = [
      ['arrive', 'DRIVER_ARRIVED'],
      ['start', 'STARTED'],
      ['complete', 'COMPLETED'],
    ] as const;

    for (const [action, status] of steps) {
      await step(poolId, action).expect(200);

      // All 3 riders moved; Shirin's cancelled 2-seat request stayed behind.
      const rides = await dataSource.query<{ id: string; status: string }[]>(
        'SELECT id, status FROM ride_requests ORDER BY created_at',
      );
      expect(rides).toEqual([
        { id: nusratRide.id, status },
        { id: rafiqRide.id, status },
        { id: shirinTwoSeats.id, status: 'CANCELLED' },
        { id: shirinRide.id, status },
      ]);

      // Exactly one history row per rider for this step.
      const events = await dataSource.query<{ ride_request_id: string }[]>(
        'SELECT ride_request_id FROM ride_events WHERE to_status = $1',
        [status],
      );
      expect(events.map((e) => e.ride_request_id).sort()).toEqual(riders);
    }
  });

  it('refuses to complete or start a trip out of order (T2 over HTTP)', async () => {
    await goOnline();
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const poolId = ((await accept(nusratRide.id).expect(200)).body as Trip).id;

    const complete = await step(poolId, 'complete').expect(409);
    expect(complete.body).toEqual({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
      message: "A ride can't go from MATCHED to COMPLETED",
    });
    await step(poolId, 'start').expect(409);
  });

  it("gives Nusrat 403 on driver routes, and Jashim 404 on a trip that isn't his", async () => {
    await goOnline();
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const poolId = ((await accept(nusratRide.id).expect(200)).body as Trip).id;

    const forbidden = await server()
      .post(`/api/v1/pools/${poolId}/start`)
      .set('Authorization', `Bearer ${nusrat}`)
      .expect(403);
    expect((forbidden.body as { code: string }).code).toBe('FORBIDDEN');
    await server()
      .get('/api/v1/driver/requests')
      .set('Authorization', `Bearer ${nusrat}`)
      .expect(403);

    // Only one driver is seeded, so "not his" is a trip id that isn't Bullet's.
    await step('7f3c2a10-0000-4000-8000-000000000000', 'start').expect(404);
  });

  it('refuses a cancel after Jashim has arrived (T5)', async () => {
    await goOnline();
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const poolId = ((await accept(nusratRide.id).expect(200)).body as Trip).id;
    await step(poolId, 'arrive').expect(200);

    const response = await cancel(nusrat, nusratRide.id).expect(409);
    expect((response.body as { code: string }).code).toBe('INVALID_TRANSITION');
    expect((await get<Ride>(nusrat, '/rides/current')).status).toBe(
      'DRIVER_ARRIVED',
    );
  });

  it('never deadlocks when Rafiq cancels as Jashim taps Arrived (20 rounds)', async () => {
    await goOnline();
    const outcomes = { cancelWon: 0, arriveWon: 0 };

    for (let round = 1; round <= 20; round++) {
      await clearRides(app);
      const nusratRide = await requestRide(nusrat, {
        ...toMohakhali,
        seats: 1,
      });
      const poolId = ((await accept(nusratRide.id).expect(200)).body as Trip)
        .id;
      const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });

      // Both at the same moment. Promise.all sends them in array order, so the
      // order alternates each round: both "cancel first" and "Arrived first"
      // really happen.
      let cancelResponse: Response;
      let arriveResponse: Response;
      if (round % 2 === 1) {
        [cancelResponse, arriveResponse] = await Promise.all([
          cancel(rafiq, rafiqRide.id),
          step(poolId, 'arrive'),
        ]);
      } else {
        [arriveResponse, cancelResponse] = await Promise.all([
          step(poolId, 'arrive'),
          cancel(rafiq, rafiqRide.id),
        ]);
      }

      // Arrived always succeeds. A deadlock would surface as a 500 here.
      expect(arriveResponse.status).toBe(200);
      const trip = arriveResponse.body as Trip;
      if (cancelResponse.status === 200) {
        // Cancel committed first: "Arrived" moved only Nusrat.
        outcomes.cancelWon++;
        expect(trip.passengers.map((p) => p.firstName)).toEqual(['Nusrat']);
        expect(await seatsTaken(app, poolId)).toBe(1);
      } else {
        // Arrived committed first: too late to cancel (PRD A7).
        outcomes.arriveWon++;
        expect(cancelResponse.status).toBe(409);
        expect((cancelResponse.body as { code: string }).code).toBe(
          'INVALID_TRANSITION',
        );
        expect(trip.passengers.map((p) => p.firstName)).toEqual([
          'Nusrat',
          'Rafiq',
        ]);
        expect(await seatsTaken(app, poolId)).toBe(2);
      }
    }

    expect(outcomes.cancelWon + outcomes.arriveWon).toBe(20);
  });

  it('refuses to accept while offline, or a request that is already matched', async () => {
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const offline = await accept(nusratRide.id).expect(409);
    expect((offline.body as { code: string }).code).toBe('DRIVER_OFFLINE');

    await goOnline();
    await accept(nusratRide.id).expect(200);
    const again = await accept(nusratRide.id).expect(409);
    expect(again.body).toEqual({
      statusCode: 409,
      code: 'REQUEST_UNAVAILABLE',
      message: 'This request was already matched or cancelled',
    });

    // Rafiq auto-joined, so his request isn't available to accept either.
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    expect(rafiqRide.status).toBe('MATCHED');
    await accept(rafiqRide.id).expect(409);
  });

  it('lists only requests Jashim can accept, and explains the ones he cannot', async () => {
    // Offline: nothing.
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 2 });
    expect(await get(jashim, '/driver/requests')).toEqual([]);

    // Online with no trip: everything that fits Bullet.
    await goOnline();
    const shirinRide = await requestRide(shirin, {
      pickupZone: 'GULSHAN_1',
      dropoffZone: 'MOHAKHALI',
      seats: 1,
    });
    expect(
      (await get<{ id: string }[]>(jashim, '/driver/requests')).map(
        (r) => r.id,
      ),
    ).toEqual([rafiqRide.id, shirinRide.id]);

    // With a Banani trip (Rafiq, 2 of 3 seats): only Banani requests that fit.
    const poolId = ((await accept(rafiqRide.id).expect(200)).body as Trip).id;
    expect(await get(jashim, '/driver/requests')).toEqual([]);
    const notJoinable = await accept(shirinRide.id).expect(409);
    expect((notJoinable.body as { code: string }).code).toBe(
      'POOL_NOT_JOINABLE',
    );

    // Nusrat wants 2 seats from Banani: 1 is free, so she waits, and accepting
    // her anyway is POOL_FULL. Everything rolls back: she is still REQUESTED.
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 2 });
    expect(nusratRide.status).toBe('REQUESTED');
    const full = await accept(nusratRide.id).expect(409);
    expect(full.body).toEqual({
      statusCode: 409,
      code: 'POOL_FULL',
      message: 'This ride just filled up',
    });
    expect((await get<Ride>(nusrat, '/rides/current')).status).toBe(
      'REQUESTED',
    );
    expect(await seatsTaken(app, poolId)).toBe(2);

    // After arriving, nobody can join: the list is empty.
    await step(poolId, 'arrive').expect(200);
    expect(await get(jashim, '/driver/requests')).toEqual([]);

    // And he can't go offline in the middle of a trip.
    const offline = await server()
      .patch('/api/v1/driver/status')
      .set('Authorization', `Bearer ${jashim}`)
      .send({ online: false })
      .expect(409);
    expect((offline.body as { code: string }).code).toBe('ACTIVE_RIDE_EXISTS');
  });
});
