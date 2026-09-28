import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../database/enums';
import { AuthUser } from '../auth.types';
import { RolesGuard } from './roles.guard';

// A fake request context carrying the given logged-in user.
function contextWith(user: AuthUser): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const jashim: AuthUser = { id: 'u-jashim', role: UserRole.DRIVER };
  const nusrat: AuthUser = { id: 'u-nusrat', role: UserRole.PASSENGER };

  function guardForRouteWith(roles: UserRole[] | undefined): RolesGuard {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
    return new RolesGuard(reflector);
  }

  it('lets Jashim into a driver-only route', () => {
    const guard = guardForRouteWith([UserRole.DRIVER]);
    expect(guard.canActivate(contextWith(jashim))).toBe(true);
  });

  it('stops Nusrat at a driver-only route with 403', () => {
    const guard = guardForRouteWith([UserRole.DRIVER]);
    expect(() => guard.canActivate(contextWith(nusrat))).toThrow(
      ForbiddenException,
    );
  });

  it('stops Jashim at a passenger-only route with 403', () => {
    const guard = guardForRouteWith([UserRole.PASSENGER]);
    expect(() => guard.canActivate(contextWith(jashim))).toThrow(
      ForbiddenException,
    );
  });

  it('lets any logged-in user through a route without @Roles', () => {
    const guard = guardForRouteWith(undefined);
    expect(guard.canActivate(contextWith(nusrat))).toBe(true);
  });
});
