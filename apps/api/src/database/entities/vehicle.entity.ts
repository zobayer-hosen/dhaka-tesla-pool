import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('vehicles')
@Check('ck_vehicles_capacity', '"capacity" BETWEEN 1 AND 6')
// The unique index is what makes this "one vehicle per driver" (ERD §4). A
// ManyToOne + unique index keeps the index name readable in the migration.
@Index('uq_vehicles_driver', ['driverId'], { unique: true })
@Index('uq_vehicles_plate', ['plateNumber'], { unique: true })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_vehicles' })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'driver_id',
    foreignKeyConstraintName: 'fk_vehicles_driver',
  })
  driver: User;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @Column({ type: 'varchar', length: 40 })
  nickname: string;

  @Column({ name: 'plate_number', type: 'varchar', length: 20 })
  plateNumber: string;

  @Column({ type: 'smallint' })
  capacity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
