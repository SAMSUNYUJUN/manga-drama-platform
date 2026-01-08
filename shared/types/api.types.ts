/**
 * API相关类型定义
 * @module shared/types/api
 */

/**
 * 统一API响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiError;
}

/**
 * API错误信息
 */
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

/**
 * 分页响应格式
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 分页查询参数
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/**
 * 排序查询参数
 */
export interface SortQuery {
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * 通用查询参数
 */
export interface QueryParams extends PaginationQuery, SortQuery {
  [key: string]: any;
}
