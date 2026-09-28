import { Injectable } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { RideEvent } from '../database/entities/ride-event.entity';
import { RideRequest } from '../database/entities/ride-request.entity';
import { EventType, PoolStatus, RequestStatus, Zone } from '../database/enums';
import { FareService } from '../fare/fare.service';

// FARE_CHANGED notes. The owner sees them in their timeline, so they never name
// another passenger (PRD §9).
const NOTE_JOINED_SHARED_RIDE = 'Joined a shared ride, pool discount applied';
const NOTE_ANOTHER_PASSENGER_JOINED =
  'Another passenger joined, pool discount applied';
const NOTE_NOW_RIDING_ALONE = 'Now riding alone, pool discount removed';

// Everything that changes who sits in a pool. It lives in RidesModule and is
// exported, so auto-join (rides) and driver accept (driver) share ONE
// seat-claiming path (ARCHITECTURE §1). Every method runs inside the caller's
// transaction: it takes the caller's EntityManager.
@Injectable()
export class PoolingService {
  constructor(private readonly fares: FareService) {}

  // Takes `seats` seats in the pool if they are still free. Returns true if they
  // were claimed, false if not.
  //
  // Why one UPDATE and not "load the pool → seatsTaken += seats → save()": with
  // load-then-save, Nusrat and Shirin can both read "2 of 3 taken" before either
  // writes; both then write 3, and 4 people are booked into a 3-seat car while
  // the row says 3. Here the check and the change are one statement. Postgres locks the row for the first UPDATE, makes
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

  // SELECT ... FROM pools WHERE id = :poolId FOR UPDATE. Holds the pool row until
  // the transaction ends. Any transaction that changes a pool's ride requests
  // calls this FIRST (lock order, ARCHITECTURE §5), so e.g. Rafiq's cancel and
  // Jashim's "Arrived" wait for each other instead of deadlocking.
  lockPool(manager: EntityManager, poolId: string): Promise<Pool> {
    return manager
      .createQueryBuilder(Pool, 'pool')
      .setLock('pessimistic_write')
      .where('pool.id = :poolId', { poolId })
      .getOneOrFail();
  }

  // Frees a cancelled booking's seats. The caller has already locked the pool
  // (lockPool) and cancelled the request. If no active booking is left, the pool
  // is cancelled too, with a conditional update. Returns true in that case, so
  // the caller can say so in the passenger's own CANCELLED event (ERD §3).
  async releaseSeats(
    manager: EntityManager,
    poolId: string,
    seats: number,
  ): Promise<boolean> {
    await manager
      .createQueryBuilder()
      .update(Pool)
      .set({ seatsTaken: () => 'seats_taken - :seats' })
      .where('id = :poolId', { poolId })
      .setParameters({ seats })
      .execute();

    if ((await this.activeBookingCount(manager, poolId)) > 0) {
      return false;
    }

    const result = await manager
      .createQueryBuilder()
      .update(Pool)
      .set({ status: PoolStatus.CANCELLED })
      .where('id = :poolId AND status = :expected', {
        poolId,
        expected: PoolStatus.MATCHED,
      })
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

  // Sets every booking's fare to match the pool: pooled while 2+ bookings share
  // it, solo otherwise (bookings, not seats: PRD §7). Only called while the pool
  // is MATCHED and locked by the caller's transaction, so nothing else can change
  // these fares meanwhile; from STARTED on, fares are locked. Each change gets a
  // FARE_CHANGED event. joinedRideId is the booking that just joined, if any.
  async recalculateFares(
    manager: EntityManager,
    poolId: string,
    joinedRideId: string | null,
  ): Promise<void> {
    const bookings = await manager.findBy(RideRequest, {
      poolId,
      status: RequestStatus.MATCHED,
    });
    const pooled = bookings.length >= 2;

    for (const booking of bookings) {
      const fare = this.fares.calculateFare({
        distanceM: booking.distanceM,
        seats: booking.seats,
        pooled,
      });
      if (fare.farePaisa === booking.farePaisa) {
        continue;
      }

      await manager.update(
        RideRequest,
        { id: booking.id, status: RequestStatus.MATCHED },
        fare,
      );

      let note = NOTE_NOW_RIDING_ALONE;
      if (pooled) {
        note =
          booking.id === joinedRideId
            ? NOTE_JOINED_SHARED_RIDE
            : NOTE_ANOTHER_PASSENGER_JOINED;
      }
      await manager.insert(RideEvent, {
        rideRequestId: booking.id,
        poolId,
        actorId: null, // the system did it
        type: EventType.FARE_CHANGED,
        oldFarePaisa: booking.farePaisa,
        newFarePaisa: fare.farePaisa,
        note,
      });
    }
  }
}
