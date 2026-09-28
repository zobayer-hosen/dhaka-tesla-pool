import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZONES } from './zones';

// Any logged-in user: passengers pick zones, drivers see them on requests.
@Controller('zones')
@UseGuards(JwtAuthGuard)
export class ZonesController {
  @Get()
  list() {
    return ZONES;
  }
}
