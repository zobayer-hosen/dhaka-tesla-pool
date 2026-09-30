import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, LessThanOrEqual, Not } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { RideEvent } from '../database/entities/ride-event.entity';
import { RideRequest } from '../database/entities/ride-request.entity';
import { User } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { EventType, PoolStatus, RequestStatus } from '../database/enums';
import { isUniqueViolation } from '../database/postgres-errors';
import { PoolingService } from '../rides/pooling.service';
import {
  asRequestStatus,
  assertTransition,
  invalidTransition,
} from '../rides/ride-state-machine';
import { DriverPoolView, DriverStatus, WaitingRequest } from './driver.types';

// A vehicle can be on one of these at a time (partial unique index on pools).
const ACTIVE_POOL_STATUSES = [
  PoolStatus.MATCHED,
  PoolStatus.DRIVER_ARRIVED,
  PoolStatus.STARTED,
];

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

@Injectable()
export class DriverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pooling: PoolingService,
  ) {}

  async getStatus(driverId: string): Promise<DriverStatus> {
    const driver = await this.dataSource.manager.findOneByOrFail(User, {
      id: driverId,
    });
    return { online: driver.isOnline };
  }

  // Online/offline (PRD D1). He can't go offline in the middle of a trip.
  async setOnline(driverId: string, online: boolean): Promise<DriverStatus> {
    const manager = this.dataSource.manager;
    if (!online) {
      const vehicle = await this.vehicleOf(manager, driverId);
      if (await this.activePool(manager, vehicle.id)) {
        throw new ConflictException({
          code: 'ACTIVE_RIDE_EXISTS',
          message: "You can't go offline during a trip",
        });
      }
    }
    await manager.update(User, { id: driverId }, { isOnline: online });
    return { online };
  }

  // Waiting requests, oldest first, but only those he can actually accept (D2):
  // - offline: none;
  // - no active trip: every request that fits Bullet;
  // - trip still MATCHED: same pickup zone and fits the free seats;
  // - trip past MATCHED (he has arrived): none, nobody joins after arrival.
  async listRequests(driverId: string): Promise<WaitingRequest[]> {
    const manager = this.dataSource.manager;
    const { online } = await this.getStatus(driverId);
    if (!online) {
      return [];
    }

    const vehicle = await this.vehicleOf(manager, driverId);
    const pool = await this.activePool(manager, vehicle.id);
    if (pool && pool.status !== PoolStatus.MATCHED) {
      return [];
    }

    const requests = await manager.find(RideRequest, {
      where: {
        status: RequestStatus.REQUESTED,
        ...(pool
          ? {
              pickupZone: pool.pickupZone,
              seats: LessThanOrEqual(pool.capacity - pool.seatsTaken),
            }
          : { seats: LessThanOrEqual(vehicle.capacity) }),
      },
      relations: { passenger: true },
      order: { createdAt: 'ASC' },
    });

    return requests.map((ride) => ({
      id: ride.id,
      passengerFirstName: firstName(ride.passenger.name),
      pickupZone: ride.pickupZone,
      dropoffZone: ride.dropoffZone,
      seats: ride.seats,
      farePaisa: ride.farePaisa,
      createdAt: ride.createdAt,
    }));
  }

  // Accept a waiting request (PRD D3). One transaction, the pool first (lock order):
  // 1. no active trip → create a pool for Bullet (capacity copied from it);
  //    an open trip in the same pickup zone → lock its pool row;
  // 2. REQUESTED → MATCHED with one conditional UPDATE (0 rows → REQUEST_UNAVAILABLE);
  // 3. claimSeat, the same one auto-join uses (false → POOL_FULL);
  // 4. recalculate fares if 2+ bookings now share the car.
  // Any error rolls all of it back: no pool, no seat, no status change, no event.
  async accept(driverId: string, rideId: string): Promise<DriverPoolView> {
    let poolId: string;
    try {
      poolId = await this.dataSource.transaction(async (manager) => {
        const driver = await manager.findOneByOrFail(User, { id: driverId });
        if (!driver.isOnline) {
          throw conflict('DRIVER_OFFLINE', 'Go online to accept requests');
        }

        const ride = await manager.findOneBy(RideRequest, { id: rideId });
        if (!ride) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: 'Request not found',
          });
        }

        const vehicle = await this.vehicleOf(manager, driverId);
        const openPool = await this.activePool(manager, vehicle.id);
        let id: string;
        let note: string;
        if (!openPool) {
          // A brand-new pool row: nobody else can see it until we commit.
          const inserted = await manager.insert(Pool, {
            vehicleId: vehicle.id,
            pickupZone: ride.pickupZone,
            capacity: vehicle.capacity,
            status: PoolStatus.MATCHED,
          });
          id = (inserted.identifiers[0] as { id: string }).id;
          note = 'Accepted by the driver, new pool created';
        } else {
          // Lock order: the pool row first, then its ride requests.
          const pool = await this.pooling.lockPool(manager, openPool.id);
          if (
            pool.status !== PoolStatus.MATCHED ||
            pool.pickupZone !== ride.pickupZone
          ) {
            throw conflict(
              'POOL_NOT_JOINABLE',
              'This request is from another pickup zone, or the driver has already arrived or the trip has started',
            );
          }
          id = pool.id;
          note = 'Accepted by the driver into a shared ride';
        }

        const matched = await this.pooling.matchRequest(
          manager,
          ride.id,
          id,
          driverId,
          note,
        );
        if (!matched) {
          throw conflict(
            'REQUEST_UNAVAILABLE',
            'This request was already matched or cancelled',
          );
        }

        // The only place where "no seat" is an error: Jashim asked for this exact
        // seat. Throwing here rolls back the request update and the new pool too.
        if (!(await this.pooling.claimSeat(manager, id, ride.seats))) {
          throw conflict('POOL_FULL', 'This ride just filled up');
        }

        await this.pooling.recalculateFares(manager, id, ride.id);
        return id;
      });
    } catch (error) {
      // Two accepts at the same moment with no trip yet: both try to create a
      // pool for Bullet, and uq_pools_active_vehicle lets only one through.
      if (isUniqueViolation(error, 'uq_pools_active_vehicle')) {
        throw conflict(
          'POOL_NOT_JOINABLE',
          'Your trip just changed, please try again',
        );
      }
      throw error;
    }

    return this.poolView(this.dataSource.manager, poolId);
  }

  // "Current trip" (PRD D5). None → 404, like GET /rides/current (DECISIONS #23).
  async currentPool(driverId: string): Promise<DriverPoolView> {
    const manager = this.dataSource.manager;
    const vehicle = await this.vehicleOf(manager, driverId);
    const pool = await this.activePool(manager, vehicle.id);
    if (!pool) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'You have no active trip',
      });
    }
    return this.poolView(manager, pool.id);
  }

  // Completed trips, newest first, with passengers and total fare (PRD D5).
  async history(driverId: string): Promise<DriverPoolView[]> {
    const manager = this.dataSource.manager;
    const vehicle = await this.vehicleOf(manager, driverId);
    const pools = await manager.find(Pool, {
      where: { vehicleId: vehicle.id, status: PoolStatus.COMPLETED },
      order: { completedAt: 'DESC' },
    });
    const views: DriverPoolView[] = [];
    for (const pool of pools) {
      views.push(await this.poolView(manager, pool.id));
    }
    return views;
  }

  arrive(driverId: string, poolId: string): Promise<DriverPoolView> {
    return this.moveTrip(driverId, poolId, PoolStatus.DRIVER_ARRIVED);
  }

  start(driverId: string, poolId: string): Promise<DriverPoolView> {
    return this.moveTrip(driverId, poolId, PoolStatus.STARTED);
  }

  complete(driverId: string, poolId: string): Promise<DriverPoolView> {
    return this.moveTrip(driverId, poolId, PoolStatus.COMPLETED);
  }

  // Arrived → Start trip → Complete trip (PRD D4): the pool and every passenger
  // still in it move together. One transaction, pool first (lock order):
  // lock the pool → conditional update of the pool → conditional update of its
  // requests → one history row per passenger.
  private async moveTrip(
    driverId: string,
    poolId: string,
    next: PoolStatus,
  ): Promise<DriverPoolView> {
    await this.dataSource.transaction(async (manager) => {
      // Only his own trip; anyone else's looks like it doesn't exist.
      const vehicle = await this.vehicleOf(manager, driverId);
      if (
        !(await manager.existsBy(Pool, { id: poolId, vehicleId: vehicle.id }))
      ) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Trip not found',
        });
      }

      // If Rafiq is cancelling right now, one of us waits here for the other.
      const pool = await this.pooling.lockPool(manager, poolId);
      const from = asRequestStatus(pool.status);
      const to = asRequestStatus(next);
      // No skipping steps, e.g. complete before start → 409 INVALID_TRANSITION.
      assertTransition(from, to);

      const poolUpdate = await manager
        .createQueryBuilder()
        .update(Pool)
        .set({ status: next, ...stepTimestamp(next) })
        .where('id = :poolId AND status = :expected', {
          poolId,
          expected: pool.status,
        })
        .execute();
      if (poolUpdate.affected !== 1) {
        throw invalidTransition(from, to);
      }

      // Everyone still at the previous step moves with the pool. Cancelled
      // passengers don't match `status = :expected`, so they are skipped.
      const riders = await manager.findBy(RideRequest, {
        poolId,
        status: from,
      });
      await manager
        .createQueryBuilder()
        .update(RideRequest)
        .set(
          next === PoolStatus.COMPLETED
            ? { status: to, completedAt: () => 'now()' }
            : { status: to },
        )
        .where('pool_id = :poolId AND status = :expected', {
          poolId,
          expected: from,
        })
        .execute();

      if (riders.length > 0) {
        await manager.insert(
          RideEvent,
          riders.map((rider) => ({
            rideRequestId: rider.id,
            poolId,
            actorId: driverId,
            type: EventType.STATUS_CHANGED,
            fromStatus: from,
            toStatus: to,
            // From here on fares never change again (PRD §7).
            note: next === PoolStatus.STARTED ? 'Fare locked' : null,
          })),
        );
      }
    });

    return this.poolView(this.dataSource.manager, poolId);
  }

  // A trip as the driver sees it: passengers who haven't cancelled, by first name.
  private async poolView(
    manager: EntityManager,
    poolId: string,
  ): Promise<DriverPoolView> {
    const pool = await manager.findOneByOrFail(Pool, { id: poolId });
    const rides = await manager.find(RideRequest, {
      where: { poolId, status: Not(RequestStatus.CANCELLED) },
      relations: { passenger: true },
      order: { createdAt: 'ASC' },
    });
    const passengers = rides.map((ride) => ({
      rideId: ride.id,
      firstName: firstName(ride.passenger.name),
      dropoffZone: ride.dropoffZone,
      seats: ride.seats,
      farePaisa: ride.farePaisa,
      status: ride.status,
    }));
    return {
      id: pool.id,
      status: pool.status,
      pickupZone: pool.pickupZone,
      seatsTaken: pool.seatsTaken,
      capacity: pool.capacity,
      passengers,
      totalFarePaisa: passengers.reduce((sum, p) => sum + p.farePaisa, 0),
      createdAt: pool.createdAt,
      arrivedAt: pool.arrivedAt,
      startedAt: pool.startedAt,
      completedAt: pool.completedAt,
    };
  }

  // Every driver is seeded with exactly one vehicle (Jashim → Bullet).
  private vehicleOf(
    manager: EntityManager,
    driverId: string,
  ): Promise<Vehicle> {
    return manager.findOneByOrFail(Vehicle, { driverId });
  }

  private activePool(
    manager: EntityManager,
    vehicleId: string,
  ): Promise<Pool | null> {
    return manager.findOneBy(Pool, {
      vehicleId,
      status: In(ACTIVE_POOL_STATUSES),
    });
  }
}

// When the pool reached this step: arrived_at, started_at or completed_at.
function stepTimestamp(step: PoolStatus) {
  const now = () => 'now()';
  if (step === PoolStatus.DRIVER_ARRIVED) {
    return { arrivedAt: now };
  }
  if (step === PoolStatus.STARTED) {
    return { startedAt: now };
  }
  return { completedAt: now };
}

// The driver sees passengers by first name only (PRD §9).
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}
