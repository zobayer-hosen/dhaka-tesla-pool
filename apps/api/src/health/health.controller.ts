import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Docker's healthcheck calls this: a 200 with { status: 'ok' } means the API is up.
  @Get()
  check() {
    return { status: 'ok' };
  }
}
