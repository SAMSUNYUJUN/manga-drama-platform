import { api as apiClient } from './api';

export interface Shot {
  id: number;
  title: string;
  spaceId: number;
  messageCount: number;
  createdAt: string;
}

export interface Message {
  id: number;
  shotId: number;
  model: string;
  prompt: string;
  mediaUrlsJson?: string;
  inputImagesJson?: string;
  status: string;
  durationMs?: number;
  createdAt: string;
}

export const listShots = async () => {
  const res = await apiClient.get('/storyboard/shots');
  return res.data.data as Shot[];
};

export const createShot = async (payload: { title: string; spaceId: number }) => {
  const res = await apiClient.post('/storyboard/shots', payload);
  return res.data.data as Shot;
};

export const deleteShot = async (id: number) => {
  await apiClient.delete(`/storyboard/shots/${id}`);
};

export const listMessages = async (shotId: number) => {
  const res = await apiClient.get(`/storyboard/shots/${shotId}/messages`);
  return res.data.data as Message[];
};

export const generateMedia = async (shotId: number, formData: FormData) => {
  const res = await apiClient.post(`/storyboard/shots/${shotId}/generate`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data as any;
};

export const deleteMessage = async (id: number) => {
  await apiClient.delete(`/storyboard/messages/${id}`);
};

export const saveMessageAssets = async (id: number, spaceId: number) => {
  const res = await apiClient.post(`/storyboard/messages/${id}/save`, { spaceId });
  return res.data.data;
};
