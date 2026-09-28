import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.config';

// The TypeORM CLI and the seed don't start Nest, so they read .env themselves.
// npm runs them from apps/api, so the shared .env is two folders up.
// In Docker there is no .env file: the variables come from docker-compose.yml.
const envFile = '../../.env';
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
}

export default new DataSource(databaseOptions(url));
