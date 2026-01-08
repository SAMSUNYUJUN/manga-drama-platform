/**
 * Roles装饰器 - 标记需要的角色权限
 * @module common/decorators
 */

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@shared/constants';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
