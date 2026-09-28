import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../database/enums';
import { DriverService } from './driver.service';
import type { DriverPoolView } from './driver.types';

// Moving a trip forward belongs to its driver (DECISIONS #14). A passenger
// gets 403; another driver's trip, or one that doesn't exist, gets 404.
@Controller('pools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class PoolsController {
  constructor(private readonly driver: DriverService) {}

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverPoolView> {
    return this.driver.arrive(user.id, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverPoolView> {
    return this.driver.start(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverPoolView> {
    return this.driver.complete(user.id, id);
  }
}
