// Imported, not global: the web app's own code shouldn't see Jest's globals.
import { describe, expect, it } from '@jest/globals';
import { goOfflineBlocked } from './driver-view';
import type { Trip } from './types';

describe('goOfflineBlocked (the "Go offline" button on Jashim\'s dashboard)', () => {
  const trip: Trip = {
    id: 'bullet-trip',
    status: 'MATCHED',
    pickupZone: 'BANANI',
    seatsTaken: 1,
    capacity: 3,
    passengers: [],
    totalFarePaisa: 10000,
    createdAt: '2026-09-30T08:41:00Z',
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
  };

  it('blocks going offline while Jashim has a trip', () => {
    expect(goOfflineBlocked(true, trip)).toBe(true);
  });

  it('allows going offline when he has no trip', () => {
    expect(goOfflineBlocked(true, null)).toBe(false);
  });

  it('never blocks the "Go online" button', () => {
    expect(goOfflineBlocked(false, null)).toBe(false);
  });
});
