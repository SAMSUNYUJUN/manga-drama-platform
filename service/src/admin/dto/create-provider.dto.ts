/**
 * Create provider DTO
 * @module admin/dto
 */

import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ProviderType } from '@shared/constants';

export class CreateProviderDto {
  @IsString()
  name: string;

  @IsEnum(ProviderType)
  type: ProviderType;

  @IsString()
  baseUrl: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsInt()
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  retryCount?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  models: string[];
}
