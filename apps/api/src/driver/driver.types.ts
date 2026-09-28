import { PoolStatus, RequestStatus, Zone } from '../database/enums';

// What Jashim sees. Passengers appear by first name only (PRD §9).

export interface DriverStatus {
  online: boolean;
}

// One waiting request he can accept (PRD D2).
export interface WaitingRequest {
  id: string;
  passengerFirstName: string;
  pickupZone: Zone;
  dropoffZone: Zone;
  seats: number;
  farePaisa: number;
  createdAt: Date;
}

export interface PoolPassenger {
  rideId: string;
  firstName: string;
  dropoffZone: Zone;
  seats: number;
  // For collecting cash (PRD D5).
  farePaisa: number;
  status: RequestStatus;
}

// His current trip or a past one: passengers, "2 / 3 seats" and the total fare.
export interface DriverPoolView {
  id: string;
  status: PoolStatus;
  pickupZone: Zone;
  seatsTaken: number;
  capacity: number;
  passengers: PoolPassenger[];
  totalFarePaisa: number;
  createdAt: Date;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}
