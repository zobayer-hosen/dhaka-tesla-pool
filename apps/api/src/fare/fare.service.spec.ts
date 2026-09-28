import { FareService } from './fare.service';

// The numbers from PRD §7 "Check it by hand", in paisa (100 paisa = 1 taka).
describe('FareService (T3)', () => {
  const fares = new FareService();

  describe('Nusrat, Banani → Mohakhali (3 km)', () => {
    it('pays 100 taka alone: 40 base + 3 × 20 distance', () => {
      expect(
        fares.calculateFare({ distanceM: 3000, seats: 1, pooled: false }),
      ).toEqual({
        baseFarePaisa: 4000,
        distanceChargePaisa: 6000,
        poolDiscountPaisa: 0,
        farePaisa: 10000,
      });
    });

    it('pays 85 taka pooled: 25% of the 60 taka distance charge (15) off', () => {
      expect(
        fares.calculateFare({ distanceM: 3000, seats: 1, pooled: true }),
      ).toEqual({
        baseFarePaisa: 4000,
        distanceChargePaisa: 6000,
        poolDiscountPaisa: 1500,
        farePaisa: 8500,
      });
    });
  });

  describe('Rafiq, Banani → Gulshan 1 (4 km)', () => {
    it('pays 120 taka alone: 40 base + 4 × 20 distance', () => {
      expect(
        fares.calculateFare({ distanceM: 4000, seats: 1, pooled: false })
          .farePaisa,
      ).toBe(12000);
    });

    it('pays 100 taka pooled: 25% of 80 (20) off', () => {
      expect(
        fares.calculateFare({ distanceM: 4000, seats: 1, pooled: true }),
      ).toEqual({
        baseFarePaisa: 4000,
        distanceChargePaisa: 8000,
        poolDiscountPaisa: 2000,
        farePaisa: 10000,
      });
    });

    it('pays 240 taka alone with 2 seats: the fare is per seat', () => {
      expect(
        fares.calculateFare({ distanceM: 4000, seats: 2, pooled: false })
          .farePaisa,
      ).toBe(24000);
    });
  });

  it('doubles the pooled fare for 2 seats too', () => {
    expect(
      fares.calculateFare({ distanceM: 3000, seats: 2, pooled: true })
        .farePaisa,
    ).toBe(17000);
  });

  it('rounds the pool discount down to a whole paisa', () => {
    // Real zone distances never produce a fraction, so use a made-up 3001 m:
    // distance charge 6002 paisa, 25% of it = 1500.5 → rounded down to 1500.
    const fare = fares.calculateFare({
      distanceM: 3001,
      seats: 1,
      pooled: true,
    });
    expect(fare.poolDiscountPaisa).toBe(1500);
    expect(Number.isInteger(fare.farePaisa)).toBe(true);
    expect(fare.farePaisa).toBe(4000 + 6002 - 1500);
  });

  it('always adds up the way the database CHECK does', () => {
    for (const distanceM of [3000, 4000, 7000, 20000]) {
      for (const seats of [1, 2, 3]) {
        for (const pooled of [false, true]) {
          const fare = fares.calculateFare({ distanceM, seats, pooled });
          expect(fare.farePaisa).toBe(
            (fare.baseFarePaisa +
              fare.distanceChargePaisa -
              fare.poolDiscountPaisa) *
              seats,
          );
        }
      }
    }
  });
});
