import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import type {
  DriverPoolView,
  DriverStatus,
  WaitingRequest,
} from './driver.types';
import { DriverStatusDto } from './dto/driver-status.dto';

// Drivers only: a passenger calling any of these gets 403.
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  // So the web app can show the online toggle in the right position.
  @Get('status')
  status(@CurrentUser() user: AuthUser): Promise<DriverStatus> {
    return this.driver.getStatus(user.id);
  }

  @Patch('status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Body() dto: DriverStatusDto,
  ): Promise<DriverStatus> {
    return this.driver.setOnline(user.id, dto.online);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser): Promise<WaitingRequest[]> {
    return this.driver.listRequests(user.id);
  }

  // 200 with his trip after accepting (201 would suggest a new request).
  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverPoolView> {
    return this.driver.accept(user.id, id);
  }
}
