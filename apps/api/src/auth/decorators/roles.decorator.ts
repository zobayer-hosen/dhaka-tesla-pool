import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../database/enums';

export const ROLES_KEY = 'roles';

// Marks a controller or route as only for these roles, e.g. @Roles(UserRole.DRIVER).
// RolesGuard reads it.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
