import type { Trip } from './types';

// Jashim can't go offline during a trip (PRD D1). The API refuses it too
// (409); the dashboard disables the button so he isn't offered it at all.
export function goOfflineBlocked(
  online: boolean,
  activeTrip: Trip | null,
): boolean {
  return online && activeTrip !== null;
}
