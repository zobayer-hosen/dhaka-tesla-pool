import { DataSourceOptions } from 'typeorm';
import { Pool } from './entities/pool.entity';
import { RideEvent } from './entities/ride-event.entity';
import { RideRequest } from './entities/ride-request.entity';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { InitialSchema1790585110765 } from './migrations/1790585110765-InitialSchema';

// One set of options for the Nest app (app.module.ts), the migration CLI and the
// seed (data-source.ts), so all of them see exactly the same entities and migrations.
export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, Vehicle, Pool, RideRequest, RideEvent],
    // Listed one by one (no file glob), so the app, the CLI and tests all load
    // exactly the same migrations, from .ts or compiled .js alike.
    migrations: [InitialSchema1790585110765],
    // The schema changes only through migrations we have read, never automatically.
    synchronize: false,
    migrationsRun: false,
    // 'pgcrypto' makes TypeORM write gen_random_uuid() as the UUID default. That
    // function is built into Postgres 13+, so no extension is installed (DECISIONS #15).
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
