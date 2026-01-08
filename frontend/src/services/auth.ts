import api from './api';
import type { AuthResponse, ApiResponse } from '../types/auth';

// 这里为了方便，直接在 service 里定义 DTO 接口，也可以在 types 里统一定义
export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export const authService = {
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', data);
    return response.data.data;
  },

  async register(data: RegisterData): Promise<any> {
    const response = await api.post<ApiResponse<any>>('/auth/register', data);
    return response.data.data;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getAccessToken() {
    return localStorage.getItem('accessToken');
  },
};
