import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { Zone } from '../../database/enums';

// Body of POST /rides/estimate and POST /rides. "Pickup and drop-off must differ"
// compares two fields, so RidesService checks it (and the database CHECK too).
export class RideRequestDto {
  @IsEnum(Zone)
  pickupZone: Zone;

  @IsEnum(Zone)
  dropoffZone: Zone;

  // 1 to 3 seats per booking, e.g. travelling with a friend (PRD A5).
  @IsInt()
  @Min(1)
  @Max(3)
  seats: number;
}
