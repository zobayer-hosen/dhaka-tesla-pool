import { Zone } from '../database/enums';
import { distanceBetween, ZONES } from './zones';

describe('zones', () => {
  it('lists all 8 zones', () => {
    expect(ZONES.map((zone) => zone.id)).toEqual(Object.values(Zone));
  });

  it('has the demo distances', () => {
    expect(distanceBetween(Zone.BANANI, Zone.MOHAKHALI)).toBe(3000);
    expect(distanceBetween(Zone.BANANI, Zone.GULSHAN_1)).toBe(4000);
  });

  it('has a positive distance for every pair, the same in both directions', () => {
    for (const from of Object.values(Zone)) {
      for (const to of Object.values(Zone)) {
        if (from === to) continue;
        expect(distanceBetween(from, to)).toBeGreaterThan(0);
        expect(distanceBetween(from, to)).toBe(distanceBetween(to, from));
      }
    }
  });

  it('has no distance from a zone to itself', () => {
    expect(() => distanceBetween(Zone.BANANI, Zone.BANANI)).toThrow();
  });
});
