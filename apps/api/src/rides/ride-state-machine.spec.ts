import { ConflictException } from '@nestjs/common';
import { RequestStatus } from '../database/enums';
import { assertTransition, canTransition } from './ride-state-machine';

const { REQUESTED, MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED } =
  RequestStatus;

describe('ride state machine (T2)', () => {
  // Exactly the moves in PRD §6.
  const allowed: [RequestStatus, RequestStatus][] = [
    [REQUESTED, MATCHED],
    [MATCHED, DRIVER_ARRIVED],
    [DRIVER_ARRIVED, STARTED],
    [STARTED, COMPLETED],
    [REQUESTED, CANCELLED],
    [MATCHED, CANCELLED],
  ];

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('allows nothing else', () => {
    const all = Object.values(RequestStatus);
    for (const from of all) {
      for (const to of all) {
        const isAllowed = allowed.some(([a, b]) => a === from && b === to);
        expect(canTransition(from, to)).toBe(isAllowed);
      }
    }
  });

  it.each([
    [REQUESTED, COMPLETED],
    [STARTED, CANCELLED],
    [DRIVER_ARRIVED, CANCELLED],
    [COMPLETED, CANCELLED],
    [COMPLETED, STARTED],
    [CANCELLED, REQUESTED],
  ])('rejects %s → %s with 409 INVALID_TRANSITION', (from, to) => {
    expect(() => assertTransition(from, to)).toThrow(ConflictException);
    try {
      assertTransition(from, to);
    } catch (error) {
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'INVALID_TRANSITION',
        message: `A ride can't go from ${from} to ${to}`,
      });
    }
  });
});
