import dataSource from './data-source';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { seedCast } from './seed-cast';

// `npm run seed` (and every Docker start): adds the demo cast in one transaction.
async function seed(): Promise<void> {
  await dataSource.initialize();

  await dataSource.transaction((manager) => seedCast(manager));

  const users = await dataSource.getRepository(User).count();
  const vehicles = await dataSource.getRepository(Vehicle).count();
  console.log(`Seed done: ${users} users, ${vehicles} vehicle(s)`);

  await dataSource.destroy();
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
