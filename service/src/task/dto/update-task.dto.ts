/**
 * 更新任务DTO
 * @module task/dto
 */

import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { TaskStatus, TaskStage } from '@shared/constants';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskStage)
  stage?: TaskStage;
}
