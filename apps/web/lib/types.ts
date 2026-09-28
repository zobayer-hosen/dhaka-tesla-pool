// The shapes the API returns (apps/api/src/**/*.types.ts). Money is integer
// paisa everywhere; the browser only formats it (lib/money.ts), never computes it.

export type Role = 'PASSENGER' | 'DRIVER';

export type RideStatus =
  | 'REQUESTED'
  | 'MATCHED'
  | 'DRIVER_ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: Role };
}

export interface Zone {
  id: string;
  name: string;
}

export interface Fare {
  baseFarePaisa: number;
  distanceChargePaisa: number;
  poolDiscountPaisa: number;
  farePaisa: number;
}

export interface FareEstimate {
  distanceM: number;
  seats: number;
  solo: Fare;
  pooled: Fare | null;
}

export interface Ride {
  id: string;
  status: RideStatus;
  pickupZone: string;
  dropoffZone: string;
  seats: number;
  distanceM: number;
  fare: Fare;
  coRiderCount: number;
  driver: { name: string; vehicle: string; plateNumber: string } | null;
  createdAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
}

export interface RideSummary {
  id: string;
  status: RideStatus;
  pickupZone: string;
  dropoffZone: string;
  seats: number;
  farePaisa: number;
  createdAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
}

export interface DriverStatus {
  online: boolean;
}

export interface WaitingRequest {
  id: string;
  passengerFirstName: string;
  pickupZone: string;
  dropoffZone: string;
  seats: number;
  farePaisa: number;
  createdAt: string;
}

export interface Trip {
  id: string;
  status: RideStatus;
  pickupZone: string;
  seatsTaken: number;
  capacity: number;
  passengers: {
    rideId: string;
    firstName: string;
    dropoffZone: string;
    seats: number;
    farePaisa: number;
    status: RideStatus;
  }[];
  totalFarePaisa: number;
  createdAt: string;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
