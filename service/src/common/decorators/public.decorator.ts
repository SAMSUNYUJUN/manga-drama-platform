/**
 * Public装饰器 - 标记无需认证的路由
 * @module common/decorators
 */

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
