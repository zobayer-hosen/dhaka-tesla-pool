import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../enums';

// Passengers and drivers log in the same way, so they share one table (ERD §3).
@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  // Always stored lowercase (the auth code lowercases it before saving).
  @Column({ type: 'varchar', length: 255 })
  email: string;

  // bcrypt hash. Never returned by the API.
  @Column({ name: 'password_hash', type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.PASSENGER,
  })
  role: UserRole;

  // Only meaningful for drivers.
  @Column({ name: 'is_online', type: 'boolean', default: false })
  isOnline: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
