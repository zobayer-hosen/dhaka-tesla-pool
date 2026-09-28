import { Injectable } from '@nestjs/common';

// All money is integer paisa (100 paisa = 1 taka). Rules from PRD §7.
export const BASE_FARE_PAISA = 4000; // 40 taka per seat
export const PER_KM_PAISA = 2000; // 20 taka per km
export const POOL_DISCOUNT_PERCENT = 25; // of the distance charge

export interface FareInput {
  distanceM: number;
  seats: number;
  // true when the pool has 2+ active bookings (bookings, not seats: PRD §7).
  pooled: boolean;
}

// The breakdown is per seat; farePaisa is the total for the booking. These are
// exactly the columns of ride_requests, whose CHECK re-does this sum.
export interface FareBreakdown {
  baseFarePaisa: number;
  distanceChargePaisa: number;
  poolDiscountPaisa: number;
  farePaisa: number;
}

// Pure math: no database, no clock, no randomness. The same input always gives
// the same fare, so it is easy to test and to check by hand.
@Injectable()
export class FareService {
  calculateFare({ distanceM, seats, pooled }: FareInput): FareBreakdown {
    const baseFarePaisa = BASE_FARE_PAISA;
    // Zone distances are whole hundreds of metres, so this is always whole paisa.
    const distanceChargePaisa = (distanceM * PER_KM_PAISA) / 1000;
    // Rounded down to a whole paisa: a fare can be at most 1 paisa per seat
    // higher, never lower (PRD §7).
    const poolDiscountPaisa = pooled
      ? Math.floor((distanceChargePaisa * POOL_DISCOUNT_PERCENT) / 100)
      : 0;
    const farePaisa =
      (baseFarePaisa + distanceChargePaisa - poolDiscountPaisa) * seats;

    return { baseFarePaisa, distanceChargePaisa, poolDiscountPaisa, farePaisa };
  }
}
