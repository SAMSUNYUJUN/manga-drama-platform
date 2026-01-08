/**
 * 用户相关类型定义
 * @module shared/types/user
 */

import { UserRole } from '../constants/enums';

/**
 * 用户基础信息
 */
export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 用户注册DTO
 */
export interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

/**
 * 用户登录DTO
 */
export interface LoginDto {
  username: string;
  password: string;
}

/**
 * 更新用户DTO
 */
export interface UpdateUserDto {
  email?: string;
  password?: string;
  role?: UserRole;
}

/**
 * 用户认证响应
 */
export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * JWT载荷
 */
export interface JwtPayload {
  sub: number;
  username: string;
  role: UserRole;
}
