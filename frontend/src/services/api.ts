/**
 * Axios实例配置
 * @module services/api
 */

import axios, { AxiosError } from 'axios';
import type { ApiResponse } from '@shared/types/api.types';

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE_URL = rawBaseUrl.startsWith('http')
  ? rawBaseUrl
  : rawBaseUrl.startsWith('/')
  ? rawBaseUrl
  : `/${rawBaseUrl}`;

// 创建axios实例
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for AI operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加token
api.interceptors.request.use(
  (config) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const headers = config.headers as any;
      if (headers?.delete) {
        headers.delete('Content-Type');
      } else if (headers) {
        delete headers['Content-Type'];
      }
    }
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：统一错误处理
const buildRequestUrl = (config?: { baseURL?: string; url?: string }) => {
  const baseURL = config?.baseURL || '';
  const url = config?.url || '';
  if (!baseURL) return url;
  if (url.startsWith('http')) return url;
  if (!url) return baseURL;
  return `${baseURL.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
};

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    const requestUrl = buildRequestUrl(error.config);
    const errorCode = (error as any).code as string | undefined;
    const isCanceled = axios.isCancel(error) || errorCode === 'ERR_CANCELED';
    const isTimeout = errorCode === 'ECONNABORTED';

    if (error.response) {
      const { status, data } = error.response;

      // 401: 未认证，跳转到登录页
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      // 返回错误消息
      const message = data?.message || data?.error?.message || 'An error occurred';
      const enhancedError = new Error(message) as Error & {
        status?: number;
        url?: string;
        code?: string;
        isTimeout?: boolean;
        isCanceled?: boolean;
      };
      enhancedError.status = status;
      enhancedError.url = requestUrl;
      enhancedError.code = errorCode;
      enhancedError.isTimeout = isTimeout;
      enhancedError.isCanceled = isCanceled;
      return Promise.reject(enhancedError);
    }

    if (error.request) {
      const enhancedError = new Error('Network error. Please check your connection.') as Error & {
        url?: string;
        code?: string;
        isTimeout?: boolean;
        isCanceled?: boolean;
      };
      enhancedError.url = requestUrl;
      enhancedError.code = errorCode;
      enhancedError.isTimeout = isTimeout;
      enhancedError.isCanceled = isCanceled;
      return Promise.reject(enhancedError);
    }

    return Promise.reject(error);
  }
);

export default api;
