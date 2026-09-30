import type { RideStatus } from './types';

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
