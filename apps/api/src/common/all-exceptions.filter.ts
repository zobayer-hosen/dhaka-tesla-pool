import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

// Code for errors that don't bring their own, e.g. Nest's 404 for an unknown
// route or the 401 from the JWT guard. Codes are listed in PRD §11.
const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

// Every error leaves the API in the same shape: { statusCode, code, message }.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      // Our own errors are thrown as e.g.
      // new ConflictException({ code: 'EMAIL_TAKEN', message: '...' }).
      const body = exception.getResponse() as { code?: string };
      response.status(statusCode).json({
        statusCode,
        code: body.code ?? CODE_BY_STATUS[statusCode] ?? 'ERROR',
        message: exception.message,
      });
      return;
    }

    // Anything else is a bug: log the stack trace, but never send it to the client.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  }
}
