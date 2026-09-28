import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // npm runs workspace scripts from apps/api, so the shared .env is two folders up.
    // In Docker there is no .env file: the variables come from docker-compose.yml.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
