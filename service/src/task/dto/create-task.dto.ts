/**
 * 创建任务DTO
 * @module task/dto
 */

import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
