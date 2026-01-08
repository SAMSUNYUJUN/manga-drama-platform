/**
 * 共享验证工具函数
 * @module shared/utils/validators
 */

import { PASSWORD_RULES, USERNAME_RULES } from '../constants/config';

/**
 * 验证用户名格式
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }
  const length = username.length;
  return length >= USERNAME_RULES.MIN_LENGTH && length <= USERNAME_RULES.MAX_LENGTH;
}

/**
 * 验证密码格式
 */
export function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }
  const length = password.length;
  return length >= PASSWORD_RULES.MIN_LENGTH && length <= PASSWORD_RULES.MAX_LENGTH;
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证分页参数
 */
export function isValidPagination(page?: number, limit?: number): boolean {
  if (page !== undefined && (typeof page !== 'number' || page < 1)) {
    return false;
  }
  if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 100)) {
    return false;
  }
  return true;
}
