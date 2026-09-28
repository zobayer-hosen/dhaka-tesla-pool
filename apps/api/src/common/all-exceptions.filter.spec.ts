import {
  ArgumentsHost,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

// A fake Express response that remembers what the filter sent.
function fakeHost() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('keeps the code and message of our own errors', () => {
    const { host, sent } = fakeHost();
    filter.catch(
      new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      }),
      host,
    );
    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      statusCode: 409,
      code: 'EMAIL_TAKEN',
      message: 'An account with this email already exists',
    });
  });

  it("gives Nest's built-in errors a code from their status", () => {
    const { host, sent } = fakeHost();
    filter.catch(new NotFoundException('Cannot GET /api/v1/nowhere'), host);
    expect(sent.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /api/v1/nowhere',
    });
  });

  it('hides the details of unexpected errors', () => {
    const { host, sent } = fakeHost();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('connection refused at 10.0.0.5'), host);
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  });
});
