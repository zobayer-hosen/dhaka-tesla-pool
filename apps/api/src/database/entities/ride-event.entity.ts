import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventType, RequestStatus } from '../enums';
import { Pool } from './pool.entity';
import { RideRequest } from './ride-request.entity';
import { User } from './user.entity';

// The history of every status or fare change. Rows are only ever inserted, in the
// same transaction as the change they describe. Notes never name another passenger.
@Entity('ride_events')
// A ride's timeline, in insert order.
@Index('ix_events_request', ['rideRequestId', 'id'])
export class RideEvent {
  // An identity column keeps insert order. Postgres returns bigint as a string.
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_ride_events',
  })
  id: string;

  @ManyToOne(() => RideRequest, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'ride_request_id',
    foreignKeyConstraintName: 'fk_ride_events_ride_request',
  })
  rideRequest: RideRequest;

  @Column({ name: 'ride_request_id', type: 'uuid' })
  rideRequestId: string;

  @ManyToOne(() => Pool, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'pool_id',
    foreignKeyConstraintName: 'fk_ride_events_pool',
  })
  pool: Pool | null;

  @Column({ name: 'pool_id', type: 'uuid', nullable: true })
  poolId: string | null;

  // NULL means the system did it (e.g. auto-join).
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'fk_ride_events_actor',
  })
  actor: User | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'enum', enum: EventType, enumName: 'event_type' })
  type: EventType;

  // STATUS_CHANGED only. from_status is NULL when the request is created.
  @Column({
    name: 'from_status',
    type: 'enum',
    enum: RequestStatus,
    enumName: 'request_status',
    nullable: true,
  })
  fromStatus: RequestStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: RequestStatus,
    enumName: 'request_status',
    nullable: true,
  })
  toStatus: RequestStatus | null;

  // FARE_CHANGED only.
  @Column({ name: 'old_fare_paisa', type: 'integer', nullable: true })
  oldFarePaisa: number | null;

  @Column({ name: 'new_fare_paisa', type: 'integer', nullable: true })
  newFarePaisa: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
