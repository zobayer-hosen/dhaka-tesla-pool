import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Prefix, validation, error format and request logging (shared with e2e tests).
  configureApp(app);

  // Only the web app may call the API from a browser. getOrThrow: if WEB_ORIGIN
  // were missing, CORS would silently allow every origin instead.
  // One origin, or several separated by commas (e.g. the Vercel site and
  // http://localhost:3000). The browser's Origin header must match one exactly.
  const webOrigins = config
    .getOrThrow<string>('WEB_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  app.enableCors({ origin: webOrigins });

  // Hosting platforms set PORT; locally and in Docker the API uses 4000.
  // With no host given, Node listens on every network interface, which is
  // what Render needs to route requests to the app.
  await app.listen(config.get<string>('PORT') ?? 4000);
}

// Top-level code can't `await`, so `void` says "not awaiting this is on purpose".
// If startup fails (e.g. WEB_ORIGIN missing), Node prints the error and exits
// with code 1 on the unhandled rejection, which is exactly what Docker should see.
void bootstrap();
