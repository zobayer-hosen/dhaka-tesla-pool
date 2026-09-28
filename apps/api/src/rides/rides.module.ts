import { Module } from '@nestjs/common';
import { FareModule } from '../fare/fare.module';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { ZonesController } from './zones.controller';

@Module({
  imports: [FareModule],
  controllers: [RidesController, ZonesController],
  providers: [RidesService],
})
export class RidesModule {}
