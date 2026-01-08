/**
 * 共享配置常量
 * @module shared/constants/config
 */

/**
 * 分页默认配置
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * 密码规则
 */
export const PASSWORD_RULES = {
  MIN_LENGTH: 6,
  MAX_LENGTH: 32,
} as const;

/**
 * 用户名规则
 */
export const USERNAME_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 50,
} as const;

/**
 * 文件上传限制
 */
export const FILE_UPLOAD = {
  MAX_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_CONCURRENT: 3,
} as const;

/**
 * JWT配置
 */
export const JWT_CONFIG = {
  EXPIRES_IN: '24h',
} as const;
