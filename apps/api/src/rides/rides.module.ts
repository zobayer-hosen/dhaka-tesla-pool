import { Module } from '@nestjs/common';
import { FareModule } from '../fare/fare.module';
import { PoolingService } from './pooling.service';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { ZonesController } from './zones.controller';

@Module({
  imports: [FareModule],
  controllers: [RidesController, ZonesController],
  providers: [RidesService, PoolingService],
  // DriverModule accepts requests with the same claimSeat (one seat-claiming path).
  exports: [PoolingService],
})
export class RidesModule {}
