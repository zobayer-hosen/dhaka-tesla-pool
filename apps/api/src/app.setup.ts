import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { requestLogger } from './common/request-logger';

// Shared by main.ts and the e2e tests, so tests run the API exactly as it runs
// in production: same prefix, validation, error format and logging.
export function configureApp(app: INestApplication): void {
  // Every route lives under /api/v1, e.g. GET /api/v1/health.
  app.setGlobalPrefix('api/v1');

  app.use(requestLogger);

  app.useGlobalPipes(
    new ValidationPipe({
      // Drop nothing silently: unknown fields (e.g. role on signup) are a 400.
      whitelist: true,
      forbidNonWhitelisted: true,
      // Turn plain JSON into DTO class instances (and "2" into 2 where typed).
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; '),
        }),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}
