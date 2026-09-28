import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PoolStatus, Zone } from '../enums';
import { RideRequest } from './ride-request.entity';
import { Vehicle } from './vehicle.entity';

// One trip of one vehicle (Bullet), shared by up to `capacity` seats.
@Entity('pools')
// The safety net under claimSeat(): even buggy code can't put 4 people in Bullet.
@Check('ck_pools_seats', '"seats_taken" BETWEEN 0 AND "capacity"')
// Bullet can't be on two active trips at once.
@Index('uq_pools_active_vehicle', ['vehicleId'], {
  unique: true,
  where: `"status" IN ('MATCHED', 'DRIVER_ARRIVED', 'STARTED')`,
})
// Auto-join looks for "an open pool in Banani".
@Index('ix_pools_open', ['pickupZone', 'status'])
export class Pool {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_pools' })
  id: string;

  @ManyToOne(() => Vehicle, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'vehicle_id',
    foreignKeyConstraintName: 'fk_pools_vehicle',
  })
  vehicle: Vehicle;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string;

  // Every passenger in the pool boards here.
  @Column({ name: 'pickup_zone', type: 'enum', enum: Zone, enumName: 'zone' })
  pickupZone: Zone;

  // Copied from the vehicle when the pool is created, so the seats CHECK can
  // compare two columns of the same row (ERD §3).
  @Column({ type: 'smallint' })
  capacity: number;

  @Column({ name: 'seats_taken', type: 'smallint', default: 0 })
  seatsTaken: number;

  @Column({
    type: 'enum',
    enum: PoolStatus,
    enumName: 'pool_status',
    default: PoolStatus.MATCHED,
  })
  status: PoolStatus;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => RideRequest, (request) => request.pool)
  requests: RideRequest[];
}
