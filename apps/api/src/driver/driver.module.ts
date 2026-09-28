import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';

// Jashim's side (ARCHITECTURE §1). Accept reuses PoolingService from RidesModule,
// so there is only one seat-claiming path.
@Module({
  imports: [RidesModule],
  controllers: [DriverController],
  providers: [DriverService],
})
export class DriverModule {}
