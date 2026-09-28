import { ConflictException } from '@nestjs/common';
import { PoolStatus, RequestStatus } from '../database/enums';

// Every move a ride may make (PRD §6, ARCHITECTURE §3). Anything not listed is
// refused, e.g. REQUESTED → COMPLETED, STARTED → CANCELLED, COMPLETED → anything.
// A pool moves through the same steps (it has no REQUESTED).
const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.REQUESTED]: [RequestStatus.MATCHED, RequestStatus.CANCELLED],
  [RequestStatus.MATCHED]: [
    RequestStatus.DRIVER_ARRIVED,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.DRIVER_ARRIVED]: [RequestStatus.STARTED],
  [RequestStatus.STARTED]: [RequestStatus.COMPLETED],
  [RequestStatus.COMPLETED]: [],
  [RequestStatus.CANCELLED]: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED[from].includes(to);
}

// Decides whether a move is allowed at all. The conditional UPDATE
// (... WHERE status = :expected) then makes sure nobody moved the row first.
export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw invalidTransition(from, to);
  }
}

// A pool's statuses have the same names as its passengers' (it just has no
// REQUESTED), so a pool is checked against the same allow-list.
export function asRequestStatus(status: PoolStatus): RequestStatus {
  return RequestStatus[status as keyof typeof RequestStatus];
}

export function invalidTransition(
  from: RequestStatus,
  to: RequestStatus,
): ConflictException {
  return new ConflictException({
    code: 'INVALID_TRANSITION',
    message: `A ride can't go from ${from} to ${to}`,
  });
}
