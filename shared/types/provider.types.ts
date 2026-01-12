/**
 * Provider related types
 * @module shared/types/provider
 */

import { ProviderType } from '../constants/enums';

export interface ProviderConfig {
  id: number;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKeyMasked?: string;
  timeoutMs?: number;
  retryCount?: number;
  enabled: boolean;
  models: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GlobalConfig {
  id: number;
  defaultLlmProviderId?: number | null;
  defaultImageProviderId?: number | null;
  defaultVideoProviderId?: number | null;
  defaultLlmModel?: string | null;
  defaultImageModel?: string | null;
  defaultVideoModel?: string | null;
  updatedAt: Date;
}
