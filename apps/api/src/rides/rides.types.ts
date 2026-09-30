import { EventType, RequestStatus, Zone } from '../database/enums';
import { FareBreakdown } from '../fare/fare.service';

// What a passenger may see of their own ride. Nothing here ever describes
// another passenger: co-riders are only a count (PRD P4, §9).

export interface FareEstimate {
  distanceM: number;
  seats: number;
  solo: FareBreakdown;
  // The lower fare when an open pool in this pickup zone can take these seats.
  pooled: FareBreakdown | null;
}

export interface RideView {
  id: string;
  status: RequestStatus;
  pickupZone: Zone;
  dropoffZone: Zone;
  seats: number;
  distanceM: number;
  // This passenger's own fare only.
  fare: FareBreakdown;
  // Other active bookings in the same pool (bookings, not seats); 0 when not in one.
  coRiderCount: number;
  // The driver and his vehicle once matched (e.g. Jashim and Bullet); null while waiting.
  driver: { name: string; vehicle: string; plateNumber: string } | null;
  createdAt: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
}

export interface RideTimelineEntry {
  type: EventType;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  oldFarePaisa: number | null;
  newFarePaisa: number | null;
  note: string | null;
  // Who did it, without naming anyone else.
  actor: 'YOU' | 'DRIVER' | 'SYSTEM';
  createdAt: Date;
}

export interface RideDetail extends RideView {
  timeline: RideTimelineEntry[];
}

// One row of "My rides" (PRD P6).
export interface RideSummary {
  id: string;
  status: RequestStatus;
  pickupZone: Zone;
  dropoffZone: Zone;
  seats: number;
  farePaisa: number;
  createdAt: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
}
