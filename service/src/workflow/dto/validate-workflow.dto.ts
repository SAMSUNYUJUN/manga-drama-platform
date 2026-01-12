/**
 * Validate workflow DTO
 * @module workflow/dto
 */

import { IsArray, IsOptional, IsObject } from 'class-validator';

export class ValidateWorkflowDto {
  @IsArray()
  nodes: any[];

  @IsArray()
  edges: any[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
