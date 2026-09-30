import type { RideStatus, RideSummary } from './types';

// How long a finished ride stays on "My ride" before the page offers only "Book".
export const RECENT_RIDE_MINUTES = 30;

// The sharing line on "My ride" (PRD P4). Nothing while waiting or cancelled;
// once matched, it counts the OTHER bookings, never names them (PRD §9).
export function sharingText(
  status: RideStatus,
  coRiderCount: number,
): string | null {
  if (status === 'REQUESTED' || status === 'CANCELLED') {
    return null;
  }
  if (coRiderCount === 0) {
    return 'Not shared yet';
  }
  return `Shared with ${coRiderCount} other passenger${coRiderCount > 1 ? 's' : ''}`;
}

// A completed ride isn't "active", so GET /rides/current answers 404 for it.
// History is newest first: show its first ride if that one was completed in the
// last 30 minutes, so the passenger still sees how the trip ended.
export function recentCompletedRide(
  rides: RideSummary[],
  now: Date,
): RideSummary | null {
  const newest = rides[0];
  if (!newest || newest.status !== 'COMPLETED' || !newest.completedAt) {
    return null;
  }
  const minutesAgo =
    (now.getTime() - new Date(newest.completedAt).getTime()) / 60_000;
  return minutesAgo <= RECENT_RIDE_MINUTES ? newest : null;
}
