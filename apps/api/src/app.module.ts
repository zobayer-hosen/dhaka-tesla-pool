import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/database.config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // npm runs workspace scripts from apps/api, so the shared .env is two folders up.
    // In Docker there is no .env file: the variables come from docker-compose.yml.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(config.getOrThrow<string>('DATABASE_URL')),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
