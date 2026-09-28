import { Injectable } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { RideEvent } from '../database/entities/ride-event.entity';
import { RideRequest } from '../database/entities/ride-request.entity';
import { EventType, PoolStatus, RequestStatus, Zone } from '../database/enums';

// Everything that changes who sits in a pool. It lives in RidesModule and is
// exported, so auto-join (rides) and driver accept (driver) share ONE
// seat-claiming path (ARCHITECTURE §1). Every method runs inside the caller's
// transaction: it takes the caller's EntityManager.
@Injectable()
export class PoolingService {
  // Takes `seats` seats in the pool if they are still free. Returns true if they
  // were claimed, false if not.
  //
  // Why one UPDATE and not "load the pool → seatsTaken += seats → save()": with
  // load-then-save, Nusrat and Shirin can both read "2 of 3 taken" before either
  // writes, and both write 3, so two people get one seat. Here the check and the
  // change are one statement. Postgres locks the row for the first UPDATE, makes
  // the second one wait until the first transaction commits, then re-checks the
  // WHERE against the new seats_taken: 3 + 1 > 3, so 0 rows change.
  //
  // It never throws for "no seat": 0 rows changed is a normal answer, not a SQL
  // error, and throwing would roll back the caller's transaction, losing the
  // passenger's brand-new request with it. (A real database error still throws.)
  async claimSeat(
    manager: EntityManager,
    poolId: string,
    seats: number,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Pool)
      .set({ seatsTaken: () => 'seats_taken + :seats' })
      .where('id = :poolId', { poolId })
      // The driver hasn't arrived yet: nobody joins after that.
      .andWhere('status = :status', { status: PoolStatus.MATCHED })
      // Enough seats are still free.
      .andWhere('seats_taken + :seats <= capacity')
      .setParameters({ seats })
      .execute();

    return result.affected === 1;
  }

  // The matching rule (PRD A2): same pickup zone, driver not arrived yet (pool
  // still MATCHED), enough free seats. Oldest pool first. This read is only a
  // hint: claimSeat re-checks the seats atomically.
  findOpenPool(
    manager: EntityManager,
    pickupZone: Zone,
    seats: number,
  ): Promise<Pool | null> {
    return manager
      .createQueryBuilder(Pool, 'pool')
      .where('pool.pickupZone = :pickupZone', { pickupZone })
      .andWhere('pool.status = :status', { status: PoolStatus.MATCHED })
      .andWhere('pool.seatsTaken + :seats <= pool.capacity', { seats })
      .orderBy('pool.createdAt', 'ASC')
      .getOne();
  }

  // REQUESTED → MATCHED into this pool: ONE conditional UPDATE plus its history
  // row. Returns false when the request isn't REQUESTED any more (matched or
  // cancelled first); the caller decides what that means.
  async matchRequest(
    manager: EntityManager,
    rideId: string,
    poolId: string,
    actorId: string | null,
    note: string,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(RideRequest)
      .set({ status: RequestStatus.MATCHED, poolId })
      .where('id = :rideId AND status = :expected', {
        rideId,
        expected: RequestStatus.REQUESTED,
      })
      .execute();
    if (result.affected !== 1) {
      return false;
    }

    await manager.insert(RideEvent, {
      rideRequestId: rideId,
      poolId,
      actorId,
      type: EventType.STATUS_CHANGED,
      fromStatus: RequestStatus.REQUESTED,
      toStatus: RequestStatus.MATCHED,
      note,
    });
    return true;
  }

  // Bookings in the pool that aren't cancelled. Bookings, not seats: Rafiq with
  // 2 seats is one booking (DECISIONS #11).
  activeBookingCount(manager: EntityManager, poolId: string): Promise<number> {
    return manager.countBy(RideRequest, {
      poolId,
      status: Not(RequestStatus.CANCELLED),
    });
  }
}
