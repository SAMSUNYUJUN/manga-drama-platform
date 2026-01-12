/**
 * Create task version DTO
 * @module task/dto
 */

import { IsOptional, IsObject, IsString } from 'class-validator';

export class CreateTaskVersionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
