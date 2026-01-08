/**
 * 查询资产DTO
 * @module asset/dto
 */

import { IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType } from '@shared/constants';
import { PAGINATION } from '@shared/constants';

export class QueryAssetDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  taskId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  versionId?: number;

  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = PAGINATION.DEFAULT_PAGE;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  @Type(() => Number)
  limit?: number = PAGINATION.DEFAULT_LIMIT;
}
