import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../database/enums';
import { AuthUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

// "Are they allowed?" Runs after JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard).
// A passenger calling a driver route (or the other way round) gets 403 FORBIDDEN.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Roles on the route wins over @Roles on the controller.
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your role is not allowed to do this',
      });
    }
    return true;
  }
}
