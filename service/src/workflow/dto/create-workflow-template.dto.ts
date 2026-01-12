/**
 * Create workflow template DTO
 * @module workflow/dto
 */

import { IsOptional, IsString } from 'class-validator';

export class CreateWorkflowTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
