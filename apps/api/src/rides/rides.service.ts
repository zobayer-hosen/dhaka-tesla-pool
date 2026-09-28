import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { RideEvent } from '../database/entities/ride-event.entity';
import { RideRequest } from '../database/entities/ride-request.entity';
import { EventType, RequestStatus } from '../database/enums';
import { isUniqueViolation } from '../database/postgres-errors';
import { FareService } from '../fare/fare.service';
import { RideRequestDto } from './dto/ride-request.dto';
import { PoolingService } from './pooling.service';
import { assertTransition, invalidTransition } from './ride-state-machine';
import {
  FareEstimate,
  RideDetail,
  RideSummary,
  RideTimelineEntry,
  RideView,
} from './rides.types';
import { distanceBetween } from './zones';

// A passenger can hold one of these at a time (PRD A4).
const ACTIVE_STATUSES = [
  RequestStatus.REQUESTED,
  RequestStatus.MATCHED,
  RequestStatus.DRIVER_ARRIVED,
  RequestStatus.STARTED,
];

@Injectable()
export class RidesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fares: FareService,
    private readonly pooling: PoolingService,
  ) {}

  // The solo fare, and the pooled fare when there is an open pool in this pickup
  // zone that already has a booking (joining it makes 2+ bookings, PRD P2).
  async estimate(dto: RideRequestDto): Promise<FareEstimate> {
    assertDifferentZones(dto);
    const distanceM = distanceBetween(dto.pickupZone, dto.dropoffZone);
    const manager = this.dataSource.manager;

    const pool = await this.pooling.findOpenPool(
      manager,
      dto.pickupZone,
      dto.seats,
    );
    const canShare =
      pool !== null &&
      (await this.pooling.activeBookingCount(manager, pool.id)) > 0;

    return {
      distanceM,
      seats: dto.seats,
      solo: this.fares.calculateFare({
        distanceM,
        seats: dto.seats,
        pooled: false,
      }),
      pooled: canShare
        ? this.fares.calculateFare({
            distanceM,
            seats: dto.seats,
            pooled: true,
          })
        : null,
    };
  }

  // One transaction (ARCHITECTURE §5):
  // 1. save the request as REQUESTED with its solo fare and first history row,
  //    so it can never be lost;
  // 2. auto-join the oldest open pool in the same pickup zone, if claimSeat says
  //    the seats are still free.
  // Either way the answer is 201, with status MATCHED or REQUESTED.
  async requestRide(
    passengerId: string,
    dto: RideRequestDto,
  ): Promise<RideView> {
    assertDifferentZones(dto);
    const distanceM = distanceBetween(dto.pickupZone, dto.dropoffZone);
    const fare = this.fares.calculateFare({
      distanceM,
      seats: dto.seats,
      pooled: false,
    });

    let rideId: string;
    try {
      rideId = await this.dataSource.transaction(async (manager) => {
        const inserted = await manager.insert(RideRequest, {
          passengerId,
          pickupZone: dto.pickupZone,
          dropoffZone: dto.dropoffZone,
          seats: dto.seats,
          distanceM,
          ...fare,
          status: RequestStatus.REQUESTED,
        });
        const id = (inserted.identifiers[0] as { id: string }).id;
        await manager.insert(RideEvent, {
          rideRequestId: id,
          actorId: passengerId,
          type: EventType.STATUS_CHANGED,
          fromStatus: null,
          toStatus: RequestStatus.REQUESTED,
        });

        // claimSeat locks the pool row before this request joins it (lock order).
        // false (someone took the seat a moment ago) or no pool: the request just
        // stays REQUESTED, visible to the driver. Never a 409 here (PRD §8).
        const pool = await this.pooling.findOpenPool(
          manager,
          dto.pickupZone,
          dto.seats,
        );
        if (
          pool &&
          (await this.pooling.claimSeat(manager, pool.id, dto.seats))
        ) {
          const matched = await this.pooling.matchRequest(
            manager,
            id,
            pool.id,
            null, // the system did it
            'Joined an open pool in your pickup zone',
          );
          // Can't happen: nobody else can see this request before we commit.
          if (!matched) {
            throw invalidTransition(
              RequestStatus.REQUESTED,
              RequestStatus.MATCHED,
            );
          }
          // 2+ bookings now share the car: everyone gets the pooled fare.
          await this.pooling.recalculateFares(manager, pool.id, id);
        }
        return id;
      });
    } catch (error) {
      // The partial unique index uq_requests_active_passenger decides, so two
      // tabs booking at the same moment can't both succeed.
      if (isUniqueViolation(error, 'uq_requests_active_passenger')) {
        throw new ConflictException({
          code: 'ACTIVE_RIDE_EXISTS',
          message: 'You already have an active ride',
        });
      }
      throw error;
    }

    return this.rideView(this.dataSource.manager, rideId);
  }

  // Past rides (completed or cancelled), newest first.
  async history(passengerId: string): Promise<RideSummary[]> {
    const rides = await this.dataSource.manager.find(RideRequest, {
      where: {
        passengerId,
        status: In([RequestStatus.COMPLETED, RequestStatus.CANCELLED]),
      },
      order: { createdAt: 'DESC' },
    });
    return rides.map((ride) => ({
      id: ride.id,
      status: ride.status,
      pickupZone: ride.pickupZone,
      dropoffZone: ride.dropoffZone,
      seats: ride.seats,
      farePaisa: ride.farePaisa,
      createdAt: ride.createdAt,
      cancelledAt: ride.cancelledAt,
      completedAt: ride.completedAt,
    }));
  }

  async current(passengerId: string): Promise<RideView> {
    const ride = await this.dataSource.manager.findOneBy(RideRequest, {
      passengerId,
      status: In(ACTIVE_STATUSES),
    });
    if (!ride) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'You have no active ride',
      });
    }
    return this.rideView(this.dataSource.manager, ride.id);
  }

  async findOne(passengerId: string, rideId: string): Promise<RideDetail> {
    const manager = this.dataSource.manager;
    await this.findOwnRide(manager, passengerId, rideId);
    const events = await manager.find(RideEvent, {
      where: { rideRequestId: rideId },
      order: { id: 'ASC' },
    });
    return {
      ...(await this.rideView(manager, rideId)),
      timeline: events.map((event) => toTimelineEntry(event, passengerId)),
    };
  }

  async cancel(passengerId: string, rideId: string): Promise<RideView> {
    await this.dataSource.transaction(async (manager) => {
      const ride = await this.findOwnRide(manager, passengerId, rideId);
      // Only REQUESTED or MATCHED: once Jashim has arrived it's too late (PRD A7).
      assertTransition(ride.status, RequestStatus.CANCELLED);

      // TODO(pooling): when the ride is in a pool, lock the pool row first
      // (SELECT ... FOR UPDATE) and free its seats (lock order, ARCHITECTURE §5).

      // One conditional UPDATE, never load → change → save(): if anything moved
      // the ride since we read it (e.g. the driver arrived), 0 rows change.
      const result = await manager
        .createQueryBuilder()
        .update(RideRequest)
        .set({ status: RequestStatus.CANCELLED, cancelledAt: () => 'now()' })
        .where('id = :id AND status = :expected', {
          id: ride.id,
          expected: ride.status,
        })
        .execute();
      if (result.affected !== 1) {
        throw invalidTransition(ride.status, RequestStatus.CANCELLED);
      }

      await manager.insert(RideEvent, {
        rideRequestId: ride.id,
        poolId: ride.poolId,
        actorId: passengerId,
        type: EventType.STATUS_CHANGED,
        fromStatus: ride.status,
        toStatus: RequestStatus.CANCELLED,
      });
    });

    return this.rideView(this.dataSource.manager, rideId);
  }

  // Someone else's ride answers exactly like a ride that doesn't exist: 404, so
  // the API never confirms that it exists (PRD §9).
  private async findOwnRide(
    manager: EntityManager,
    passengerId: string,
    rideId: string,
  ): Promise<RideRequest> {
    const ride = await manager.findOneBy(RideRequest, {
      id: rideId,
      passengerId,
    });
    if (!ride) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Ride not found',
      });
    }
    return ride;
  }

  private async rideView(
    manager: EntityManager,
    rideId: string,
  ): Promise<RideView> {
    const ride = await manager.findOneByOrFail(RideRequest, { id: rideId });
    return {
      id: ride.id,
      status: ride.status,
      pickupZone: ride.pickupZone,
      dropoffZone: ride.dropoffZone,
      seats: ride.seats,
      distanceM: ride.distanceM,
      fare: {
        baseFarePaisa: ride.baseFarePaisa,
        distanceChargePaisa: ride.distanceChargePaisa,
        poolDiscountPaisa: ride.poolDiscountPaisa,
        farePaisa: ride.farePaisa,
      },
      coRiderCount: await this.coRiderCount(manager, ride),
      driver: await this.driverOf(manager, ride.poolId),
      createdAt: ride.createdAt,
      cancelledAt: ride.cancelledAt,
      completedAt: ride.completedAt,
    };
  }

  // The number of OTHER bookings in my pool that aren't cancelled. Bookings, not
  // seats: Rafiq with 2 seats is 1 co-rider (DECISIONS #11).
  private async coRiderCount(
    manager: EntityManager,
    ride: RideRequest,
  ): Promise<number> {
    if (!ride.poolId) {
      return 0;
    }
    return manager.countBy(RideRequest, {
      poolId: ride.poolId,
      id: Not(ride.id),
      status: Not(RequestStatus.CANCELLED),
    });
  }

  private async driverOf(
    manager: EntityManager,
    poolId: string | null,
  ): Promise<RideView['driver']> {
    if (!poolId) {
      return null;
    }
    const pool = await manager.findOneOrFail(Pool, {
      where: { id: poolId },
      relations: { vehicle: { driver: true } },
    });
    return {
      name: pool.vehicle.driver.name,
      vehicle: pool.vehicle.nickname,
      plateNumber: pool.vehicle.plateNumber,
    };
  }
}

function assertDifferentZones(dto: RideRequestDto): void {
  if (dto.pickupZone === dto.dropoffZone) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'pickupZone and dropoffZone must be different',
    });
  }
}

function toTimelineEntry(
  event: RideEvent,
  passengerId: string,
): RideTimelineEntry {
  let actor: RideTimelineEntry['actor'] = 'DRIVER';
  if (event.actorId === null) {
    actor = 'SYSTEM';
  } else if (event.actorId === passengerId) {
    actor = 'YOU';
  }
  return {
    type: event.type,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    oldFarePaisa: event.oldFarePaisa,
    newFarePaisa: event.newFarePaisa,
    note: event.note,
    actor,
    createdAt: event.createdAt,
  };
}
