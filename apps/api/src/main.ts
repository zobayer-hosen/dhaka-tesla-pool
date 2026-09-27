import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Every route lives under /api/v1, e.g. GET /api/v1/health.
  app.setGlobalPrefix('api/v1');

  // Only the web app may call the API from a browser. getOrThrow: if WEB_ORIGIN
  // were missing, CORS would silently allow every origin instead.
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') });

  // Hosting platforms set PORT; locally and in Docker the API uses 4000.
  await app.listen(config.get<string>('PORT') ?? 4000);
}
bootstrap();
