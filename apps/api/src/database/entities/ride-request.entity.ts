import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RequestStatus, Zone } from '../enums';
import { Pool } from './pool.entity';
import { User } from './user.entity';

// One passenger's booking. pool_id is also the pool membership (ERD §3).
// Money is integer paisa. The breakdown is per seat; fare_paisa is the total.
@Entity('ride_requests')
@Check('ck_ride_requests_zones', '"pickup_zone" <> "dropoff_zone"')
@Check('ck_ride_requests_seats', '"seats" BETWEEN 1 AND 3')
@Check('ck_ride_requests_distance', '"distance_m" > 0')
@Check(
  'ck_ride_requests_fare_parts',
  '"base_fare_paisa" >= 0 AND "distance_charge_paisa" >= 0 AND "pool_discount_paisa" >= 0',
)
// The database refuses a total that doesn't add up.
@Check(
  'ck_ride_requests_fare',
  '"fare_paisa" = ("base_fare_paisa" + "distance_charge_paisa" - "pool_discount_paisa") * "seats"',
)
// Anyone MATCHED or later must be in a pool.
@Check(
  'ck_ride_requests_pool',
  `"status" IN ('REQUESTED', 'CANCELLED') OR "pool_id" IS NOT NULL`,
)
// One active ride per passenger (PRD A4), even if two tabs submit at once.
@Index('uq_requests_active_passenger', ['passengerId'], {
  unique: true,
  where: `"status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED')`,
})
// "My rides", newest first. The migration adds DESC by hand (TypeORM can't).
@Index('ix_requests_passenger_history', ['passengerId', 'createdAt'])
// The driver's list of waiting requests.
@Index('ix_requests_waiting', ['status', 'pickupZone', 'createdAt'])
// The driver's passenger list.
@Index('ix_requests_pool', ['poolId'])
export class RideRequest {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_ride_requests',
  })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'passenger_id',
    foreignKeyConstraintName: 'fk_ride_requests_passenger',
  })
  passenger: User;

  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId: string;

  // NULL while the request is waiting for a seat.
  @ManyToOne(() => Pool, (pool) => pool.requests, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'pool_id',
    foreignKeyConstraintName: 'fk_ride_requests_pool',
  })
  pool: Pool | null;

  @Column({ name: 'pool_id', type: 'uuid', nullable: true })
  poolId: string | null;

  @Column({ name: 'pickup_zone', type: 'enum', enum: Zone, enumName: 'zone' })
  pickupZone: Zone;

  @Column({ name: 'dropoff_zone', type: 'enum', enum: Zone, enumName: 'zone' })
  dropoffZone: Zone;

  @Column({ type: 'smallint' })
  seats: number;

  // Copied from the zone table when the request is made.
  @Column({ name: 'distance_m', type: 'integer' })
  distanceM: number;

  @Column({ name: 'base_fare_paisa', type: 'integer' })
  baseFarePaisa: number;

  @Column({ name: 'distance_charge_paisa', type: 'integer' })
  distanceChargePaisa: number;

  // 0 while riding solo.
  @Column({ name: 'pool_discount_paisa', type: 'integer', default: 0 })
  poolDiscountPaisa: number;

  @Column({ name: 'fare_paisa', type: 'integer' })
  farePaisa: number;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    enumName: 'request_status',
    default: RequestStatus.REQUESTED,
  })
  status: RequestStatus;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
