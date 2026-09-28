import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
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

// Adds Jashim, Bullet, Nusrat, Rafiq and Shirin. Used by the seed script and by
// the e2e tests, so tests run with exactly the demo cast.
export async function seedCast(manager: EntityManager): Promise<void> {
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
}
