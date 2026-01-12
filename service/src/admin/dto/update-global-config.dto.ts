/**
 * Update global config DTO
 * @module admin/dto
 */

import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateGlobalConfigDto {
  @IsOptional()
  @IsInt()
  defaultLlmProviderId?: number;

  @IsOptional()
  @IsInt()
  defaultImageProviderId?: number;

  @IsOptional()
  @IsInt()
  defaultVideoProviderId?: number;

  @IsOptional()
  @IsString()
  defaultLlmModel?: string;

  @IsOptional()
  @IsString()
  defaultImageModel?: string;

  @IsOptional()
  @IsString()
  defaultVideoModel?: string;
}
