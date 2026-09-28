import { DataSourceOptions } from 'typeorm';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';

// One set of options for the Nest app (app.module.ts), the migration CLI and the
// seed (data-source.ts), so all of them see exactly the same entities and migrations.
export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, Vehicle],
    migrations: [],
    // The schema changes only through migrations we have read, never automatically.
    synchronize: false,
    migrationsRun: false,
    // 'pgcrypto' makes TypeORM write gen_random_uuid() as the UUID default. That
    // function is built into Postgres 13+, so no extension is installed (DECISIONS #15).
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
