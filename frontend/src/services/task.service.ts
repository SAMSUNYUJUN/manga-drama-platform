/**
 * 任务服务
 * @module services/task
 */

import api from './api';
import type { ApiResponse, PaginatedResponse } from '@shared/types/api.types';
import type { Task, TaskDetail, CreateTaskDto, UpdateTaskDto } from '@shared/types/task.types';

/**
 * 创建任务
 */
export const createTask = async (data: CreateTaskDto): Promise<Task> => {
  const response = await api.post<ApiResponse<Task>>('/tasks', data);
  return response.data.data!;
};

/**
 * 获取任务列表
 */
export const getTasks = async (params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Task>> => {
  const response = await api.get<ApiResponse<PaginatedResponse<Task>>>('/tasks', { params });
  return response.data.data!;
};

/**
 * 获取任务详情
 */
export const getTask = async (id: number): Promise<TaskDetail> => {
  const response = await api.get<ApiResponse<TaskDetail>>(`/tasks/${id}`);
  return response.data.data!;
};

/**
 * 更新任务
 */
export const updateTask = async (id: number, data: UpdateTaskDto): Promise<Task> => {
  const response = await api.patch<ApiResponse<Task>>(`/tasks/${id}`, data);
  return response.data.data!;
};

/**
 * 删除任务
 */
export const deleteTask = async (id: number): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};
