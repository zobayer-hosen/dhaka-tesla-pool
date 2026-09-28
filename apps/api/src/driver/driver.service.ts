import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import { Pool } from '../database/entities/pool.entity';
import { RideRequest } from '../database/entities/ride-request.entity';
import { User } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { PoolStatus, RequestStatus } from '../database/enums';
import { DriverStatus, WaitingRequest } from './driver.types';

// A vehicle can be on one of these at a time (partial unique index on pools).
const ACTIVE_POOL_STATUSES = [
  PoolStatus.MATCHED,
  PoolStatus.DRIVER_ARRIVED,
  PoolStatus.STARTED,
];

@Injectable()
export class DriverService {
  constructor(private readonly dataSource: DataSource) {}

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

// The driver sees passengers by first name only (PRD §9).
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}
