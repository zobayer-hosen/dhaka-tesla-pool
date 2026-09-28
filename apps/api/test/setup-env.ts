import { testDatabaseUrl } from './test-env';

// Runs before each e2e test file: point the app at the test database before
// AppModule reads DATABASE_URL (a variable already in process.env wins over .env).
process.env.DATABASE_URL = testDatabaseUrl();
