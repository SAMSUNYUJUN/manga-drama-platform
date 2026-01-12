/**
 * Create workflow template version DTO
 * @module workflow/dto
 */

import { IsArray, IsOptional, IsObject } from 'class-validator';

export class CreateWorkflowTemplateVersionDto {
  @IsArray()
  nodes: any[];

  @IsArray()
  edges: any[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
