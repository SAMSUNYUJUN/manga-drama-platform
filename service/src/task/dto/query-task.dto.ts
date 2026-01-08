/**
 * 查询任务DTO
 * @module task/dto
 */

import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@shared/constants';
import { PAGINATION } from '@shared/constants';

export class QueryTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

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
