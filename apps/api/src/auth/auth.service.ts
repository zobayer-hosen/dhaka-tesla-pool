import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../database/enums';
import { isUniqueViolation } from '../database/postgres-errors';
import { JwtPayload, LoginResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 10;

// A real bcrypt hash that no password matches. Login compares against it when the
// email doesn't exist, so "no such user" takes as long as "wrong password" and the
// response time doesn't reveal who has an account.
const NO_USER_HASH =
  '$2b$10$q7jUMQFf.89qnjD9jIlxm.1p6aX43DGWqpp7eCSMTIU/sBPiRNizG';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  // Creates a PASSENGER (drivers are seeded, PRD A3) and logs them in.
  async signup(dto: SignupDto): Promise<LoginResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.users.save(
        this.users.create({
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: UserRole.PASSENGER,
        }),
      );
      return this.loginResponse(user);
    } catch (error) {
      // The unique index decides, so two sign-ups with one email can't both succeed.
      if (isUniqueViolation(error, 'uq_users_email')) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findOneBy({
      email: dto.email.toLowerCase(),
    });
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? NO_USER_HASH,
    );
    // The same answer for "no such email" and "wrong password", so the login
    // form can't be used to find out who has an account.
    if (!user || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }
    return this.loginResponse(user);
  }

  // Never returns the User entity itself, so password_hash can't leak.
  private async loginResponse(user: User): Promise<LoginResponse> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, name: user.name, role: user.role },
    };
  }
}
