/**
 * Create workflow run DTO
 * @module workflow/dto
 */

import { IsInt, IsObject, IsOptional } from 'class-validator';

export class CreateWorkflowRunDto {
  @IsInt()
  templateVersionId: number;

  @IsInt()
  taskId: number;

  @IsInt()
  taskVersionId: number;

  @IsOptional()
  @IsObject()
  startInputs?: Record<string, any>;
}
