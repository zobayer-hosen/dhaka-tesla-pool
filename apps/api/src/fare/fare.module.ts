import { Module } from '@nestjs/common';
import { FareService } from './fare.service';

// Fare math on its own (ARCHITECTURE §1): used by rides now, pooling and driver later.
@Module({
  providers: [FareService],
  exports: [FareService],
})
export class FareModule {}
