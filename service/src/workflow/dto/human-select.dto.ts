/**
 * Human select action DTO
 * @module workflow/dto
 */

import { IsArray, IsInt, IsObject, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class HumanSelectDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  nodeRunId?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  selectedIndices?: number[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  selectedAssetIds?: number[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
