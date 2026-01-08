/**
 * 认证服务
 * @module services/auth
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { AuthResponse, User, RegisterDto, LoginDto } from '@shared/types/user.types';

/**
 * 用户注册
 */
export const register = async (data: RegisterDto): Promise<AuthResponse> => {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', data);
  return response.data.data!;
};

/**
 * 用户登录
 */
export const login = async (data: LoginDto): Promise<AuthResponse> => {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', data);
  return response.data.data!;
};

/**
 * 获取当前用户信息
 */
export const getProfile = async (): Promise<User> => {
  const response = await api.get<ApiResponse<User>>('/auth/profile');
  return response.data.data!;
};
