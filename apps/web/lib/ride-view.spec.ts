// Imported, not global: the web app's own code shouldn't see Jest's globals.
import { describe, expect, it } from '@jest/globals';
import { recentCompletedRide, sharingText } from './ride-view';
import type { RideSummary } from './types';

describe('sharingText (the "Shared with" line on My ride)', () => {
  it('says nothing while Nusrat is still waiting for a driver', () => {
    expect(sharingText('REQUESTED', 0)).toBeNull();
  });

  it('says "Not shared yet" once she is matched but alone in Bullet', () => {
    expect(sharingText('MATCHED', 0)).toBe('Not shared yet');
    expect(sharingText('DRIVER_ARRIVED', 0)).toBe('Not shared yet');
    expect(sharingText('STARTED', 0)).toBe('Not shared yet');
  });

  it('counts the other bookings when Rafiq and Shirin share the car', () => {
    expect(sharingText('MATCHED', 1)).toBe('Shared with 1 other passenger');
    expect(sharingText('STARTED', 2)).toBe('Shared with 2 other passengers');
  });

  it('says nothing for a cancelled ride', () => {
    expect(sharingText('CANCELLED', 0)).toBeNull();
  });
});

describe('recentCompletedRide (what My ride shows after the trip)', () => {
  const now = new Date('2026-09-30T09:00:00Z');
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000).toISOString();

  function ride(overrides: Partial<RideSummary>): RideSummary {
    return {
      id: 'nusrat-ride',
      status: 'COMPLETED',
      pickupZone: 'BANANI',
      dropoffZone: 'MOHAKHALI',
      seats: 1,
      farePaisa: 8500,
      createdAt: minutesAgo(40),
      cancelledAt: null,
      completedAt: minutesAgo(10),
      ...overrides,
    };
  }

  it('shows the ride Nusrat completed 10 minutes ago', () => {
    const completed = ride({});
    expect(recentCompletedRide([completed], now)).toBe(completed);
  });

  it('still shows it at exactly 30 minutes', () => {
    const completed = ride({ completedAt: minutesAgo(30) });
    expect(recentCompletedRide([completed], now)).toBe(completed);
  });

  it('stops showing it after 30 minutes', () => {
    expect(
      recentCompletedRide([ride({ completedAt: minutesAgo(31) })], now),
    ).toBeNull();
  });

  it('shows nothing when her newest ride was cancelled', () => {
    const cancelled = ride({
      id: 'newer',
      status: 'CANCELLED',
      completedAt: null,
      cancelledAt: minutesAgo(2),
    });
    expect(recentCompletedRide([cancelled, ride({})], now)).toBeNull();
  });

  it('shows nothing when she has no rides yet', () => {
    expect(recentCompletedRide([], now)).toBeNull();
  });
});
