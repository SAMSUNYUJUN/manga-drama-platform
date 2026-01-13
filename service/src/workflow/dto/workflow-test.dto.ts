/**
 * Workflow test DTO
 * @module workflow/dto
 */

import { IsArray, IsInt, IsObject, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowTestDto {
  @IsArray()
  nodes: any[];

  @IsArray()
  edges: any[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  templateId?: number;

  @IsOptional()
  @IsObject()
  startInputs?: Record<string, any>;
}
