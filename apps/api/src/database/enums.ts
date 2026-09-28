// The five Postgres enums from ERD §2. String values, so the database stores
// readable text ('BANANI', 'MATCHED') and the TypeScript names match it exactly.

export enum UserRole {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
}

export enum Zone {
  BANANI = 'BANANI',
  GULSHAN_1 = 'GULSHAN_1',
  MOHAKHALI = 'MOHAKHALI',
  DHANMONDI = 'DHANMONDI',
  MIRPUR = 'MIRPUR',
  UTTARA = 'UTTARA',
  FARMGATE = 'FARMGATE',
  BASHUNDHARA = 'BASHUNDHARA',
}

// A pool has no REQUESTED: it only exists once a driver has accepted someone.
export enum PoolStatus {
  MATCHED = 'MATCHED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RequestStatus {
  REQUESTED = 'REQUESTED',
  MATCHED = 'MATCHED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum EventType {
  STATUS_CHANGED = 'STATUS_CHANGED',
  FARE_CHANGED = 'FARE_CHANGED',
}
