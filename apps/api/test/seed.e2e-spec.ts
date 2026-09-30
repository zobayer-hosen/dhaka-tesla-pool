import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { seedCast } from '../src/database/seed-cast';
import { createTestApp, loginAs, resetDatabase } from './test-app';

// The seed runs on every Docker start and by hand in production, so running it
// again must never duplicate anyone (ON CONFLICT DO NOTHING).
describe('Seed (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app); // empty database + the seed once
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds both drivers and their cars once, even when run twice more', async () => {
    const dataSource = app.get(DataSource);
    await dataSource.transaction((manager) => seedCast(manager));
    await dataSource.transaction((manager) => seedCast(manager));

    const users = await dataSource.query<{ name: string; role: string }[]>(
      'SELECT name, role FROM users ORDER BY name',
    );
    expect(users).toEqual([
      { name: 'Jashim', role: 'DRIVER' },
      { name: 'Kamal', role: 'DRIVER' },
      { name: 'Nusrat', role: 'PASSENGER' },
      { name: 'Rafiq', role: 'PASSENGER' },
      { name: 'Shirin', role: 'PASSENGER' },
    ]);

    const vehicles = await dataSource.query<
      { driver: string; nickname: string; plate: string; capacity: number }[]
    >(
      `SELECT u.name AS driver, v.nickname, v.plate_number AS plate, v.capacity
       FROM vehicles v JOIN users u ON u.id = v.driver_id ORDER BY v.nickname`,
    );
    expect(vehicles).toEqual([
      {
        driver: 'Jashim',
        nickname: 'Bullet',
        plate: 'DHAKA-BA-11-0841',
        capacity: 3,
      },
      {
        driver: 'Kamal',
        nickname: 'Toofan',
        plate: 'DHAKA-GA-22-1107',
        capacity: 3,
      },
    ]);

    // The demo password works for Kamal too.
    expect(await loginAs(app, 'kamal')).toEqual(expect.any(String));
  });
});
