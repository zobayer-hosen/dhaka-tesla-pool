import {
  Body,
  Controller,
  Get,
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
import { RideRequestDto } from './dto/ride-request.dto';
import { RidesService } from './rides.service';
import type {
  FareEstimate,
  RideDetail,
  RideSummary,
  RideView,
} from './rides.types';

// Passengers only: Jashim calling any of these gets 403.
@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PASSENGER)
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  estimate(@Body() dto: RideRequestDto): FareEstimate {
    return this.rides.estimate(dto);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: RideRequestDto,
  ): Promise<RideView> {
    return this.rides.requestRide(user.id, dto);
  }

  @Get()
  history(@CurrentUser() user: AuthUser): Promise<RideSummary[]> {
    return this.rides.history(user.id);
  }

  // Declared before ':id', so "current" isn't read as a ride id.
  @Get('current')
  current(@CurrentUser() user: AuthUser): Promise<RideView> {
    return this.rides.current(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RideDetail> {
    return this.rides.findOne(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RideView> {
    return this.rides.cancel(user.id, id);
  }
}
