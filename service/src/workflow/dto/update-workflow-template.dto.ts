/**
 * Update workflow template DTO
 * @module workflow/dto
 */

import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  spaceId?: number | null;
}
