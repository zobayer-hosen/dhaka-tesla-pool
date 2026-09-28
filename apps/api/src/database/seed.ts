import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { UserRole } from './enums';

// Demo-only logins from PRD §14 (labelled as such in the README). No rides here:
// rides are created live in the demo.
const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 10;

const cast = [
  { name: 'Jashim', email: 'jashim@teslapool.dev', role: UserRole.DRIVER },
  { name: 'Nusrat', email: 'nusrat@teslapool.dev', role: UserRole.PASSENGER },
  { name: 'Rafiq', email: 'rafiq@teslapool.dev', role: UserRole.PASSENGER },
  { name: 'Shirin', email: 'shirin@teslapool.dev', role: UserRole.PASSENGER },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  await dataSource.transaction(async (manager) => {
    for (const person of cast) {
      const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
      // ON CONFLICT DO NOTHING: running the seed twice creates no duplicates
      // and leaves existing rows untouched.
      await manager
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({ ...person, passwordHash })
        .orIgnore()
        .execute();
    }

    const jashim = await manager.findOneByOrFail(User, {
      email: 'jashim@teslapool.dev',
    });
    await manager
      .createQueryBuilder()
      .insert()
      .into(Vehicle)
      .values({
        driverId: jashim.id,
        nickname: 'Bullet',
        plateNumber: 'DHAKA-BA-11-0841',
        capacity: 3,
      })
      .orIgnore()
      .execute();
  });

  const users = await dataSource.getRepository(User).count();
  const vehicles = await dataSource.getRepository(Vehicle).count();
  console.log(`Seed done: ${users} users, ${vehicles} vehicle(s)`);

  await dataSource.destroy();
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
