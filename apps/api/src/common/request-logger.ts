import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

// One log line per request, written when the response has been sent:
// "POST /api/v1/auth/login 200 84ms user=-". Only method, path, status, duration
// and user id: never bodies or headers, so passwords and tokens are never logged.
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    // Set by the JWT guard on protected routes; still undefined on public ones.
    const { user } = req as { user?: { id: string } };
    const durationMs = Date.now() - startedAt;
    logger.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms user=${user?.id ?? '-'}`,
    );
  });

  next();
}
