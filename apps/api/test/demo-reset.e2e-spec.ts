import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { clearDemoRides, countDemoRows } from '../src/database/demo-data';
import { createTestApp, loginAs, resetDatabase } from './test-app';

// npm run demo:reset: empties rides, pools and their history, keeps the cast
// and Bullet, and sends drivers offline, all in one transaction.
describe('Demo reset (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes rides, pools and events, keeps users and vehicles, and sends Jashim offline', async () => {
    const jashim = await loginAs(app, 'jashim');
    const nusrat = await loginAs(app, 'nusrat');
    const rafiq = await loginAs(app, 'rafiq');
    const server = () => request(app.getHttpServer());

    // A demo left half-way: Jashim online, a trip with Nusrat and Rafiq.
    await server()
      .patch('/api/v1/driver/status')
      .set('Authorization', `Bearer ${jashim}`)
      .send({ online: true })
      .expect(200);
    const nusratRide = await server()
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${nusrat}`)
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', seats: 1 })
      .expect(201);
    const nusratRideId = (nusratRide.body as { id: string }).id;
    await server()
      .post(`/api/v1/driver/requests/${nusratRideId}/accept`)
      .set('Authorization', `Bearer ${jashim}`)
      .expect(200);
    await server()
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${rafiq}`)
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', seats: 1 })
      .expect(201);

    const dataSource = app.get(DataSource);
    const before = await countDemoRows(dataSource.manager);
    // The seeded cast: 5 users (Jashim and Kamal drive), 2 vehicles.
    expect(before).toMatchObject({
      users: 5,
      driversOnline: 1,
      vehicles: 2,
      pools: 1,
      rideRequests: 2,
    });
    expect(before.rideEvents).toBeGreaterThan(0);

    await dataSource.transaction((manager) => clearDemoRides(manager));

    expect(await countDemoRows(dataSource.manager)).toEqual({
      users: 5,
      driversOnline: 0,
      vehicles: 2,
      pools: 0,
      rideRequests: 0,
      rideEvents: 0,
    });

    // The cast can use the app straight away: Nusrat has no active ride.
    await server()
      .get('/api/v1/rides/current')
      .set('Authorization', `Bearer ${nusrat}`)
      .expect(404);
  });
});
