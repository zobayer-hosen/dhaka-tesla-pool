import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PoolingService } from '../src/rides/pooling.service';
import {
  clearRides,
  createOpenPoolForBullet,
  createTestApp,
  loginAs,
  resetDatabase,
  seatsTaken,
} from './test-app';

interface Ride {
  id: string;
  status: string;
  fare: { poolDiscountPaisa: number; farePaisa: number };
  coRiderCount: number;
  driver: { name: string; vehicle: string } | null;
}

interface TimelineEntry {
  type: string;
  toStatus: string | null;
  oldFarePaisa: number | null;
  newFarePaisa: number | null;
  note: string | null;
  actor: string;
}

const toMohakhali = { pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI' };
const toGulshan1 = { pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1' };

describe('Pooling (e2e)', () => {
  let app: INestApplication<App>;
  let nusrat: string;
  let rafiq: string;
  let shirin: string;
  let poolId: string;

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

  // Each test: no rides, and one open, empty pool for Bullet in Banani.
  beforeEach(async () => {
    await clearRides(app);
    poolId = await createOpenPoolForBullet(app);
  });

  async function requestRide(
    token: string,
    body: { pickupZone: string; dropoffZone: string; seats: number },
  ): Promise<Ride> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return response.body as Ride;
  }

  async function currentRide(token: string): Promise<Ride> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rides/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as Ride;
  }

  async function cancel(token: string, rideId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function timeline(token: string, rideId: string) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/rides/${rideId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as { timeline: TimelineEntry[] };
  }

  it("T1: fills Bullet's 3 seats and never a 4th", async () => {
    // Nusrat and Rafiq auto-join Bullet's open pool: 2 of 3 seats.
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    expect(nusratRide.status).toBe('MATCHED');
    expect(nusratRide.driver).toMatchObject({
      name: 'Jashim',
      vehicle: 'Bullet',
    });
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    expect(rafiqRide.status).toBe('MATCHED');
    expect(await seatsTaken(app, poolId)).toBe(2);

    // Shirin wants 2 seats, only 1 is free: her request is saved and waits.
    const shirinTwoSeats = await requestRide(shirin, {
      ...toGulshan1,
      seats: 2,
    });
    expect(shirinTwoSeats.status).toBe('REQUESTED');
    expect(await seatsTaken(app, poolId)).toBe(2);

    // She cancels and books again with 1 seat: Bullet is full.
    await cancel(shirin, shirinTwoSeats.id);
    const shirinOneSeat = await requestRide(shirin, {
      ...toGulshan1,
      seats: 1,
    });
    expect(shirinOneSeat.status).toBe('MATCHED');
    expect(await seatsTaken(app, poolId)).toBe(3);

    // One more claim: claimSeat answers false (it doesn't throw) and nothing changes.
    const dataSource = app.get(DataSource);
    const pooling = app.get(PoolingService);
    const claimed = await dataSource.transaction((manager) =>
      pooling.claimSeat(manager, poolId, 1),
    );
    expect(claimed).toBe(false);
    expect(await seatsTaken(app, poolId)).toBe(3);

    // And the database itself refuses a 4th seat, whatever the code does.
    await expect(
      dataSource.query('UPDATE pools SET seats_taken = 4 WHERE id = $1', [
        poolId,
      ]),
    ).rejects.toThrow(/ck_pools_seats/);
  });

  it('drops Nusrat from 100 to 85 taka when Rafiq joins, and back when he cancels', async () => {
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    // Alone in the pool: the solo fare.
    expect(nusratRide.fare.farePaisa).toBe(10000);

    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    expect(rafiqRide.fare.farePaisa).toBe(10000); // 12000 solo → 10000 pooled
    expect((await currentRide(nusrat)).fare).toMatchObject({
      poolDiscountPaisa: 1500,
      farePaisa: 8500,
    });

    await cancel(rafiq, rafiqRide.id);
    expect((await currentRide(nusrat)).fare).toMatchObject({
      poolDiscountPaisa: 0,
      farePaisa: 10000,
    });
    expect((await timeline(nusrat, nusratRide.id)).timeline).toContainEqual(
      expect.objectContaining({
        type: 'FARE_CHANGED',
        oldFarePaisa: 8500,
        newFarePaisa: 10000,
        note: 'Now riding alone, pool discount removed',
      }),
    );
  });

  it('charges Rafiq alone with 2 seats the solo fare: 240 taka', async () => {
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 2 });
    expect(rafiqRide.status).toBe('MATCHED');
    expect(rafiqRide.fare).toMatchObject({
      poolDiscountPaisa: 0,
      farePaisa: 24000,
    });
    expect(await seatsTaken(app, poolId)).toBe(2);
  });

  it('counts bookings, not seats, and never shows Nusrat anything about Rafiq', async () => {
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 2 });

    // Nusrat's estimate already shows the pooled fare she'd get by joining.
    const estimate = await request(app.getHttpServer())
      .post('/api/v1/rides/estimate')
      .set('Authorization', `Bearer ${nusrat}`)
      .send({ ...toMohakhali, seats: 1 })
      .expect(200);
    expect(estimate.body).toMatchObject({
      solo: { farePaisa: 10000 },
      pooled: { farePaisa: 8500 },
    });

    await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const nusratView = await currentRide(nusrat);
    // Rafiq holds 2 seats but is 1 booking: "Shared with 1 other passenger".
    expect(nusratView.coRiderCount).toBe(1);
    expect(nusratView.fare.farePaisa).toBe(8500);

    // Two bookings now share Bullet, so Rafiq's 2 seats are pooled too.
    const rafiqView = await currentRide(rafiq);
    expect(rafiqView.coRiderCount).toBe(1);
    expect(rafiqView.fare.farePaisa).toBe(20000);

    // Nothing in Nusrat's view names Rafiq, shows his fare, drop-off or ride.
    expect(JSON.stringify(nusratView)).not.toMatch(
      new RegExp(`Rafiq|GULSHAN_1|20000|24000|${rafiqRide.id}`, 'i'),
    );
  });

  it("shows the fare change in Nusrat's timeline without naming Rafiq", async () => {
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });

    const { timeline: entries } = await timeline(nusrat, nusratRide.id);
    expect(entries).toContainEqual({
      type: 'FARE_CHANGED',
      fromStatus: null,
      toStatus: null,
      oldFarePaisa: 10000,
      newFarePaisa: 8500,
      note: 'Another passenger joined, pool discount applied',
      actor: 'SYSTEM',
      createdAt: expect.any(String) as string,
    });
    expect(JSON.stringify(entries)).not.toMatch(
      new RegExp(`Rafiq|${rafiqRide.id}`, 'i'),
    );
  });

  it('frees seats on cancel, and cancels the pool when the last passenger leaves', async () => {
    const nusratRide = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    const rafiqRide = await requestRide(rafiq, { ...toGulshan1, seats: 1 });
    expect(await seatsTaken(app, poolId)).toBe(2);

    await cancel(rafiq, rafiqRide.id);
    expect(await seatsTaken(app, poolId)).toBe(1);

    await cancel(nusrat, nusratRide.id);
    expect(await seatsTaken(app, poolId)).toBe(0);
    const [pool] = await app
      .get(DataSource)
      .query<{ status: string }[]>('SELECT status FROM pools WHERE id = $1', [
        poolId,
      ]);
    expect(pool.status).toBe('CANCELLED');

    const { timeline: entries } = await timeline(nusrat, nusratRide.id);
    expect(entries[entries.length - 1]).toMatchObject({
      toStatus: 'CANCELLED',
      note: 'pool cancelled: last passenger left',
    });

    // With no open pool left, a new request waits for Jashim.
    const again = await requestRide(nusrat, { ...toMohakhali, seats: 1 });
    expect(again.status).toBe('REQUESTED');
  });
});
